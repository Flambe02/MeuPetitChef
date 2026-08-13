import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

interface RecipeImageProps {
  /** `RecipeCard.heroImageUrl` / `RecipeDetail.heroImageUrl` — already resolved to a linked photo or a storage URL, or `null`. */
  src: string | null;
  alt?: string;
  /** Sizing and shape of the box — `size-14 rounded-md`, `aspect-[16/10] w-full`, `absolute inset-0`, … */
  className?: string;
  /** What shows in place of the photo, whether `src` was never there or the URL rotted. Defaults to a bare muted icon. */
  fallback?: React.ReactNode;
}

/**
 * A recipe photo that never shows the browser's broken-image glyph.
 *
 * Every photo in this app is either linked from somewhere else on the web
 * (`recipes.photo_url`, migration 16) or a Supabase Storage public URL built
 * from `hero_image_path` — `pickPhoto()` already picked one or returned
 * `null`. A linked photo can rot at any moment; state, not a DOM side effect,
 * is what lets the same conditional cover both "never had one" and "had one,
 * it broke" with one fallback instead of two different looks.
 */
export function RecipeImage({ src, alt = '', className, fallback }: RecipeImageProps) {
  const [failed, setFailed] = useState(false);
  // A `src` change (a different recipe rendered through the same element,
  // e.g. a list re-sorting) must get its own fresh attempt.
  const [lastSrc, setLastSrc] = useState(src);
  if (src !== lastSrc) {
    setLastSrc(src);
    setFailed(false);
  }

  const showImage = Boolean(src) && !failed;

  return (
    <div className={cn('flex items-center justify-center overflow-hidden bg-inset', className)}>
      {showImage ? (
        <img
          src={src!}
          alt={alt}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        (fallback ?? <ImageOff aria-hidden className="size-5 text-ink-muted" strokeWidth={1.5} />)
      )}
    </div>
  );
}
