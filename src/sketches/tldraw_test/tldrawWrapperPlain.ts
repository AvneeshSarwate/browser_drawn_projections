import React, { useEffect } from 'react';
import { Tldraw, useEditor, type Editor } from 'tldraw';
import 'tldraw/tldraw.css'

interface MyTldrawWrapperProps {
  onEditorReady: (editor: Editor) => void;
}

export const MyTldrawWrapper: React.FC<MyTldrawWrapperProps> = ({ onEditorReady }: MyTldrawWrapperProps): React.ReactNode => {
  // const editor = useEditor();

  // useEffect(() => {
  //   if (editor && onEditorReady) {
  //     onEditorReady(editor);
  //   }
  // }, [editor, onEditorReady]);

  // Using React.createElement to avoid JSX syntax
  return React.createElement(Tldraw, null);
};
