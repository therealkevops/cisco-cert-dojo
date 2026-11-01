import { deskExercises } from "./desk";
import { dcaiDeskExercises } from "./desk-dcai";
import { dccorDeskExercises } from "./desk-dccor";
import { sizingExercises, type SizingExercise } from "./sizing";

/** Every worksheet: DCAI Sizing Desk first, then the ENCOR Design & Automation Desk. */
export const worksheets: SizingExercise[] = [...sizingExercises, ...deskExercises, ...dccorDeskExercises, ...dcaiDeskExercises];
/** Every Design & Automation Desk worksheet, ENCOR then DCAI. */
export const deskSheets = worksheets.filter((e) => e.area === "desk");
export const worksheetById = Object.fromEntries(worksheets.map((e) => [e.id, e]));
