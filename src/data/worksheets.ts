import { deskExercises } from "./desk";
import { sizingExercises, type SizingExercise } from "./sizing";

/** Every worksheet: DCAI Sizing Desk first, then the ENCOR Design & Automation Desk. */
export const worksheets: SizingExercise[] = [...sizingExercises, ...deskExercises];
export const worksheetById = Object.fromEntries(worksheets.map((e) => [e.id, e]));
