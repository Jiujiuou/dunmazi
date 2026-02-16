/** UI 相关：清除错误等 */
export function uiSlice(set) {
  return {
    clearError: () => set({ error: null }),
  }
}
