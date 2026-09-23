import { MessageSquare } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';

interface Props {
  enabled: boolean;
  onClick: () => void;
}

/** Opens the assistant panel. Lives in the page header; hidden until set up. */
export const AiButton = ({ enabled, onClick }: Props): JSX.Element | null => {
  if (!enabled) return null;
  return (
    <Button variant="ghost" size="sm" aria-label="Open AI assistant" onClick={onClick}>
      <MessageSquare />
      <span className="hidden sm:inline">Assistant</span>
    </Button>
  );
};
