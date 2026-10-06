import type { OwlshReport } from "../../types/report";
import type { DefenseReport } from "./types";
import { deriveIncident } from "./incident";
import { alignInvestigation } from "./align";
import { gradeDefense } from "./grade";
import { investigationGhost } from "./ghost";
import { defenseLesson } from "./lesson";

/** Orchestrate an attacker capture (incident) + an analyst run into one defense report. Pure. */
export function assembleDefenseReport(attacker: OwlshReport, run: OwlshReport): DefenseReport {
  const incident = deriveIncident(attacker);
  const result = alignInvestigation(incident, run);
  return {
    mode: "defense",
    session: run.session,
    incident,
    result,
    grade: gradeDefense(result),
    ghost: investigationGhost(result),
    lesson: defenseLesson(result),
  };
}
