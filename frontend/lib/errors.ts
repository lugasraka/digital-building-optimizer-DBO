import type { Problem } from "./types";

export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }
}

export function isProblem(payload: unknown): payload is Problem {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.type === "string" &&
    typeof p.title === "string" &&
    typeof p.status === "number" &&
    typeof p.detail === "string"
  );
}
