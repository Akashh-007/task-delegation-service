import { QueryEntity } from "../../entities/core/query.entity";
import { ResponseEntity } from "../../entities/core/response.entity";
import { Constants } from "../../utils/constants.util";
import MasterModel from "../master.model";

export class TasksModel extends MasterModel {

    constructor() {
        super();
    }

    public async updateResponsibility(params: { task_id: number }, payload: { responsibility: string }) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        let query = "";
        const values: any[] = [];
    
        try {
            // Build the UPDATE clause
            query = `UPDATE public.tasks_master SET `;
    
            // Add each field in the payload to the SET clause with placeholders
            Object.keys(payload).forEach((field, index) => {
                query += `${field} = $${index + 1}, `;
                values.push(payload[field]);
            });
    
            // Remove trailing comma and space from the SET clause
            query = this.methods.rtrim(query, ", ");
    
            // Build the WHERE clause
            const paramStartIndex = values.length + 1; // Start from the next placeholder index
            query += ' WHERE ';
    
            Object.entries(params).forEach(([key, value], index) => {
                query += `${key} = $${paramStartIndex + index} AND `;
                values.push(value);
            });
    
            // Remove trailing AND from the WHERE clause
            query = this.methods.rtrim(query, " AND");
    
            // Execute the query with the values
            queryModel = await this.sql.executeQuery(query, values);
    
            // Handle the response
            if (queryModel.status === Constants.SUCCESS) {
                resModel.status = queryModel.status;
                resModel.info =
                    "OK: DB Query: " +
                    queryModel.info +
                    " : " +
                    queryModel.tat +
                    " : " +
                    queryModel.message;
                resModel.data = queryModel;
            } else {
                resModel.status = Constants.ERROR;
                resModel.info = "ERROR: DB Query: " + JSON.stringify(queryModel);
            }
        } catch (error) {
            resModel.status = -33;
            resModel.info = "catch : " + resModel.info + " : " + error;
            console.log(error);
            this.logger.error(JSON.stringify(resModel), `${this.constructor.name} : updateResponsibility`);
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 100;
        }
    
        return resModel;
    }
    

    public async bulkUpdateAssignedUsers(assignments: Map<number, string>) {
        const startMS = new Date().getTime();
        const resModel = { ...ResponseEntity };
        let queryModel = { ...QueryEntity };
        
        try {
            const values: any[] = [];
            
            // Build the case statement for bulk update
            const cases = Array.from(assignments.entries())
                .map(([taskId, userId], index) => {
                    const userParamIndex = index * 2 + 1;
                    const taskParamIndex = index * 2 + 2;
                    values.push(userId, taskId);
                    return `WHEN id = $${taskParamIndex}::integer THEN $${userParamIndex}::text`;
                })
                .join('\n');
    
            const taskIds = Array.from(assignments.keys());
            
            const query = `
                UPDATE public.tasks_master  
                SET responsibility = CASE 
                    ${cases}
                    END
                WHERE id = ANY($${values.length + 1}::integer[])
            `;
          
            
            values.push(taskIds);
    
            queryModel = await this.sql.executeQuery(query, values);
    
            if (queryModel.status === Constants.SUCCESS) {
                resModel.status = Constants.SUCCESS;
            } else {
                resModel.status = Constants.ERROR;
                resModel.info = "ERROR: DB Query: " + JSON.stringify(queryModel);
            }
        } catch (error) {
            resModel.status = Constants.ERROR;
            resModel.info = "catch : " + error;
            this.logger.error(JSON.stringify({
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined
            }), `${this.constructor.name}:bulkUpdateAssignedUsers`);
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }
    
        return resModel;
    }
}
