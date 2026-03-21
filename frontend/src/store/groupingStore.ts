import { create } from 'zustand';

export const MAX_GROUPING_COMPARISON = 4;

interface GroupingStore {
  selectedGroupingIds: string[];
  isComparisonOpen: boolean;
  activeGroupingId: string | null;
  toggleGrouping: (id: string) => void;
  clearSelection: () => void;
  syncAvailableGroupings: (availableIds: string[]) => void;
  openComparison: () => void;
  closeComparison: () => void;
  setActiveGrouping: (id: string) => void;
}

function hasSameSelection(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export const useGroupingStore = create<GroupingStore>()((set) => ({
  selectedGroupingIds: [],
  isComparisonOpen: false,
  activeGroupingId: null,

  toggleGrouping: (id: string) =>
    set((state) => {
      if (state.selectedGroupingIds.includes(id)) {
        const nextSelection = state.selectedGroupingIds.filter((value) => value !== id);
        const nextActiveGroupingId =
          state.activeGroupingId === id ? nextSelection[0] ?? null : state.activeGroupingId;

        return {
          selectedGroupingIds: nextSelection,
          activeGroupingId: nextActiveGroupingId,
          isComparisonOpen:
            nextSelection.length === 0 ? false : state.isComparisonOpen,
        };
      }

      if (state.selectedGroupingIds.length >= MAX_GROUPING_COMPARISON) {
        return state;
      }

      return {
        selectedGroupingIds: [...state.selectedGroupingIds, id],
        activeGroupingId: state.activeGroupingId ?? id,
      };
    }),

  clearSelection: () =>
    set({
      selectedGroupingIds: [],
      activeGroupingId: null,
      isComparisonOpen: false,
    }),

  syncAvailableGroupings: (availableIds: string[]) =>
    set((state) => {
      const nextSelection = state.selectedGroupingIds.filter((id) =>
        availableIds.includes(id)
      );
      const nextActiveGroupingId =
        state.activeGroupingId && nextSelection.includes(state.activeGroupingId)
          ? state.activeGroupingId
          : nextSelection[0] ?? null;

      if (
        hasSameSelection(nextSelection, state.selectedGroupingIds) &&
        nextActiveGroupingId === state.activeGroupingId
      ) {
        return state;
      }

      return {
        selectedGroupingIds: nextSelection,
        activeGroupingId: nextActiveGroupingId,
        isComparisonOpen:
          nextSelection.length === 0 ? false : state.isComparisonOpen,
      };
    }),

  openComparison: () =>
    set((state) => {
      if (state.selectedGroupingIds.length === 0) {
        return state;
      }

      return {
        isComparisonOpen: true,
        activeGroupingId: state.activeGroupingId ?? state.selectedGroupingIds[0] ?? null,
      };
    }),

  closeComparison: () => set({ isComparisonOpen: false }),

  setActiveGrouping: (id: string) =>
    set((state) => {
      if (!state.selectedGroupingIds.includes(id)) {
        return state;
      }

      return {
        activeGroupingId: id,
      };
    }),
}));
