import "server-only";
import { cached } from "@/lib/cache";
import { getPhilosopherNote } from "./notes";
import {
  getConcept,
  getDashboard,
  getExam,
  getPhilosopher,
  getQuestionDetail,
  getSource,
  getTrends,
  listConcepts,
  listExams,
  listPhilosophers,
  listQuestionsByPhilosopher,
  listQuestionSummaries,
  listSources,
  searchAll,
} from "./queries";
import { findQuestionsForTopics, findRelatedQuestions } from "./related";
import { getPatterns } from "./trends";
import { getConceptNotes, getPhilosopherNotebook, listConceptsByPhilosopher } from "./study";

/**
 * 공개 페이지용 조회 (서버에 저장해 두고 재사용 → lib/cache.ts).
 * 관리자 화면은 항상 최신이어야 하므로 원래 함수(queries.ts 등)를 그대로 쓴다.
 */
export const cachedDashboard = cached("dashboard", getDashboard);
export const cachedExams = cached("exams", listExams);
export const cachedExam = cached("exam", getExam);
export const cachedQuestionSummaries = cached("question-summaries", listQuestionSummaries);
export const cachedQuestionDetail = cached("question-detail", getQuestionDetail);
export const cachedRelatedQuestions = cached("related-questions", findRelatedQuestions);
export const cachedQuestionsForTopics = cached("questions-for-topics", findQuestionsForTopics);
export const cachedPhilosophers = cached("philosophers", listPhilosophers);
export const cachedPhilosopher = cached("philosopher", getPhilosopher);
export const cachedPhilosopherNotebook = cached("philosopher-notebook", getPhilosopherNotebook);
export const cachedPhilosopherNote = cached("philosopher-note", getPhilosopherNote);
export const cachedQuestionsByPhilosopher = cached("questions-by-philosopher", listQuestionsByPhilosopher);
export const cachedConcepts = cached("concepts", listConcepts);
export const cachedConceptsByPhilosopher = cached("concepts-by-philosopher", listConceptsByPhilosopher);
export const cachedConcept = cached("concept", getConcept);
export const cachedConceptNotes = cached("concept-notes", getConceptNotes);
export const cachedSources = cached("sources", listSources);
export const cachedSource = cached("source", getSource);
export const cachedSearch = cached("search", searchAll);
export const cachedTrends = cached("trends", getTrends);
export const cachedPatterns = cached("patterns", getPatterns);
