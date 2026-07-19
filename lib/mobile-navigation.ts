export function shouldBlockAndroidBack(hasUnsavedChanges: boolean, saving: boolean) {
  return hasUnsavedChanges && !saving;
}
