import React, { useEffect } from 'react'
import { Tldraw, useEditor, type Editor } from 'tldraw';

interface MyTldrawWrapperProps {
  onEditorReady: (editor: Editor) => void;
}

export const MyTldrawWrapper: React.FC<MyTldrawWrapperProps> = ({ onEditorReady }: MyTldrawWrapperProps): React.ReactNode => {
  const editor = useEditor();

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  return <Tldraw />;
};

interface GreetingProps {
  name: string; // Property to hold the name to greet
}

export const TestComponent: React.FC<GreetingProps> = ({ name }) => {
  return <h1>Hello, {name}!</h1>;
};

export const SimpleComponent = () => <div>Hello from React!</div>;