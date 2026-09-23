import { Tags } from 'lucide-react';
import type { Category } from '../../../shared/types';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { categoryColor } from './CategoryBadge';

interface Props {
  categories: Category[];
  onPick: (categoryId: string | undefined) => void;
}

/** Bulk action: move the selected items to a category (or none). */
export const SetCategoryMenu = ({ categories, onPick }: Props): JSX.Element => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm">
        <Tags />
        Set category
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="max-h-72 overflow-y-auto">
      {categories.map((c) => (
        <DropdownMenuItem key={c.id} onSelect={() => onPick(c.id)}>
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(c) }}
            aria-hidden
          />
          {c.name}
        </DropdownMenuItem>
      ))}
      {categories.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={() => onPick(undefined)}>No category</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
