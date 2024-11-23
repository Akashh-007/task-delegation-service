import { Request, Response } from "express";
import { Constants } from "../../../utils/constants.util";
import { ResponseEntity } from "../../../entities/core/response.entity";
import MasterController from "../../master.controller";
import { TasksModel } from "../../../models/v1/tasks.model";
import * as fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface UserMap {
    fire: string[];
    civil: string[];
    plumbing: string[];
    electric: string[];
    other: string[];
}

interface IndexMap {
    fire: number;
    civil: number;
    plumbing: number;
    electric: number;
    other: number;
}

export class TasksController extends MasterController {
    private keybaseMap: Map<string, string>;
    private readonly stopWords: Set<string>;
    private readonly tasksApiUrl: string;
    private readonly usersApiUrl: string;
    private tasksModel: TasksModel;

    constructor() {
        super();
        this.tasksModel = new TasksModel();

        // bindings
        this.delegateTasks = this.delegateTasks.bind(this);
        
        this.initializeKeybase();
        this.stopWords = new Set(['and', 'of', 'at','Part','of','the','and','or','but','if','or','because','as','until','while','as','until','while','as','as','until','while','as','until','while']);
        this.tasksApiUrl = process.env.TASKS_API_URL || 'http://localhost:5006/api/v1/all-tasks';
        this.usersApiUrl = process.env.USERS_API_URL || 'http://localhost:5000/api/v1/users';
    }

    private initializeKeybase(): void {
        try {
            const keybasePath = path.join(__dirname, '../../../assets/keybase.json');
            const keybase = JSON.parse(fs.readFileSync(keybasePath, 'utf8'));
            this.keybaseMap = new Map(Object.entries(keybase));
        } catch (error) {
            this.logger.error(`Failed to load keybase: ${error}`, 'TasksController:initializeKeybase');
            throw new Error('Failed to initialize keybase');
        }
    }

    private processName(name: string): string[] {
        const cleanWord = (word: string): string =>
            word.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '').toLowerCase();

        return name
            .split(' ')
            .map(cleanWord)
            .filter(word => word && !this.stopWords.has(word))
            .map(word => this.keybaseMap.get(word))
            .filter((mappedValue): mappedValue is string => !!mappedValue);
    }

    private determineFinalCategory(categories: string[]): string {
        const frequency: { [key: string]: number } = {};

        categories.forEach(category => {
            frequency[category] = (frequency[category] || 0) + 1;
        });

        const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);

        if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
            return 'other';
        }

        return sorted[0][0];
    }

    private categorizeTasks(tasks: any[]): Map<number, string> {
        const taskCategories = new Map<number, string>();

        tasks.forEach(task => {
            if (task.name) {
                const mappedValues = this.processName(task.name);
                
                if (mappedValues.length > 0) {
                    const finalCategory = this.determineFinalCategory(mappedValues);
                    taskCategories.set(task.id, finalCategory);
                } else {
                    taskCategories.set(task.id, 'other');
                }
            }
        });

        return taskCategories;
    }

    private async fetchUsers(): Promise<{
        userMap: UserMap;
        indexMap: IndexMap;
    }> {
        const userMap: UserMap = {
            fire: [],
            civil: [],
            plumbing: [],
            electric: [],
            other: []
        };

        const indexMap: IndexMap = {
            fire: 0,
            civil: 0,
            plumbing: 0,
            electric: 0,
            other: 0
        };

        try {
            const response = await axios.get(this.usersApiUrl);
            const users = response.data.data.rows;
            console.log(users)
            users.forEach(user => {
                const category = user.cat_name || 'other';
                if (category in userMap) {
                    userMap[category as keyof UserMap].push(`${user.first_name}  ${user.last_name}`);
                }
            });

        } catch (error) {
            this.logger.error(`Error fetching users: ${error}`, 'TasksController:fetchUsers');
            throw error;
        }

        return { userMap, indexMap };
    }

    private assignTaskToUser(
        category: string,
        userMap: UserMap,
        indexMap: IndexMap
    ): string | null {
        if (category === 'other') {
            return null;
        }
        if (!(category in userMap)) {
            return null;
        }

        const users = userMap[category as keyof UserMap];
        if (users.length === 0) {
            return null;
        }

        const currentIndex = indexMap[category as keyof IndexMap];
        const assignedUser = users[currentIndex];

        // Update index for next assignment (round-robin)
        indexMap[category as keyof IndexMap] = (currentIndex + 1) % users.length;

        return assignedUser;
    }

    async delegateTasks(req: Request, res: Response) {
        const startMS = new Date().getTime();
        let resModel = { ...ResponseEntity }
        
        try {
            // Fetch tasks from API
            
            const tasksResponse = await axios.get(this.tasksApiUrl);
            
            // const tasks = tasksResponse.data.data.rows;
            const tasks = tasksResponse.data?.data?.rows;
        
        console.log('Tasks received:', tasks?.length || 0);
        
        
        if (!tasks || !Array.isArray(tasks)) {
            throw new Error(`Invalid tasks data received: ${JSON.stringify(tasksResponse.data)}`);
        }
        
            
            // Process categories
            const taskCategories = this.categorizeTasks(tasks);
            
            
            // Fetch users and create maps
            
            const { userMap, indexMap } = await this.fetchUsers();
            
    

            // // Assign tasks to users
            const taskAssignments = new Map<number, string>();

            taskCategories.forEach((category, taskId) => {
                // console.log(category, taskId)
                const assignedUserId = this.assignTaskToUser(category, userMap, indexMap);
              
                if (assignedUserId !== null) {
                    taskAssignments.set(taskId, assignedUserId);
                }
            });
            
            //update task assignments
            const updateResult = await this.tasksModel.bulkUpdateAssignedUsers(taskAssignments);
            resModel.data = Object.fromEntries(taskAssignments)
            // Prepare response
            resModel.status = Constants.SUCCESS;
            resModel.endDT = new Date();
            resModel.tat = (new Date().getTime() - startMS) / 1000;
            
            res.status(Constants.HTTP_OK).json(resModel);

        } catch (error) {
            console.error('Error in delegateTasks:', error);
            resModel.status = Constants.ERROR;
            resModel.info = `Error in delegateTasks: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.logger.error(JSON.stringify({
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined
            }), `${this.constructor.name}:delegateTasks`);
            
            res.status(Constants.HTTP_INTERNAL_SERVER_ERROR).json(resModel);
        }
    }
}