import { ayuLight, dracula } from "thememirror";
import { useTheme } from "./useTheme";

// CodeMirror themes live here (not in useTheme) so that only editor-based
// tools pull thememirror/CodeMirror into their chunks.
export function useEditorTheme() {
  const { isDark } = useTheme();

  const codeMirrorTheme = () => (isDark.value ? dracula : ayuLight);

  return { codeMirrorTheme };
}
