export type CleanerAssignmentMode = "priority" | "training_rotation" | "manual";

type CleanerAssignment = {
  cleaner_account_id: string | null;
};

export function rotateCleanerAssignments<T extends CleanerAssignment>(
  assignments: T[],
  nextCleanerAccountId?: string | null
) {
  const startIndex = nextCleanerAccountId
    ? assignments.findIndex((assignment) => assignment.cleaner_account_id === nextCleanerAccountId)
    : -1;

  return startIndex > 0
    ? [...assignments.slice(startIndex), ...assignments.slice(0, startIndex)]
    : assignments;
}

export function findNextEligibleCleanerAssignment<T extends CleanerAssignment>(params: {
  assignments: T[];
  assignmentMode: CleanerAssignmentMode;
  currentCleanerAccountId: string | null;
  nextCleanerAccountId?: string | null;
  declinedCleanerIds: Set<string>;
  unavailableCleanerIds: Set<string>;
}) {
  const {
    assignments,
    assignmentMode,
    currentCleanerAccountId,
    nextCleanerAccountId,
    declinedCleanerIds,
    unavailableCleanerIds,
  } = params;
  const currentIndex = assignments.findIndex(
    (assignment) => assignment.cleaner_account_id === currentCleanerAccountId
  );

  let nextOrder: T[];
  if (currentIndex >= 0) {
    nextOrder = assignments.slice(currentIndex + 1);
    if (assignmentMode === "training_rotation") {
      nextOrder = [...nextOrder, ...assignments.slice(0, currentIndex)];
    }
  } else if (assignmentMode === "training_rotation") {
    nextOrder = rotateCleanerAssignments(assignments, nextCleanerAccountId);
  } else {
    nextOrder = assignments;
  }

  const nextAssignment = nextOrder.find(
    (assignment) =>
      !!assignment.cleaner_account_id &&
      !declinedCleanerIds.has(assignment.cleaner_account_id) &&
      !unavailableCleanerIds.has(assignment.cleaner_account_id)
  );

  return { nextAssignment: nextAssignment || null, nextOrder };
}
