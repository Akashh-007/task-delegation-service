import { Router } from "express";
import { AuthMiddleware } from "../middlewares/auth.middleware";
import { TasksController } from "../controllers/v1/api/tasks.controller";

export class Routes {
  public readonly router: Router;

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes(): void {

    // middlewares
    const authMiddleware = new AuthMiddleware();

    // controllers
    const tasksController = new TasksController();

    // user routes
    // this.router.get(`/tasks`, tasksController.fetchTasks);
    // this.router.get(`/all-tasks`, tasksController.fetchAllTasks);
    this.router.get(`/delegate-tasks`, tasksController.delegateTasks);
  }
}