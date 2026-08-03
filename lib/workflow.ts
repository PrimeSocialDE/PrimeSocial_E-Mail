import { WORKFLOW_STEPS } from "@/types";

export function getNextTouchpointDate(workflowStartedAt: string, nextStep: number): Date | null {
  const stepConfig = WORKFLOW_STEPS.find((s) => s.step === nextStep);
  if (!stepConfig) return null;
  const start = new Date(workflowStartedAt);
  const d = new Date(start);
  d.setDate(start.getDate() + stepConfig.day);
  return d;
}

export function calculateNextStep(currentStep: number): number | null {
  const next = currentStep + 1;
  return WORKFLOW_STEPS.find((s) => s.step === next) ? next : null;
}

export function isDue(nextTouchpointAt: string | null): boolean {
  if (!nextTouchpointAt) return false;
  return new Date(nextTouchpointAt) <= new Date();
}

export function getDaysUntilDue(nextTouchpointAt: string | null): number | null {
  if (!nextTouchpointAt) return null;
  const diff = new Date(nextTouchpointAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getStepConfig(step: number) {
  return WORKFLOW_STEPS.find((s) => s.step === step) ?? null;
}
