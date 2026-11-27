import { useState } from "react";

interface ResilientImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackIcon?: string;
}

export function ResilientImage({
  src,
  alt,
  className = "w-14 h-14 rounded-lg object-cover bg-surface-container shrink-0",
  fallbackIcon = "inventory_2",
}: ResilientImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-gradient-to-br from-surface-container-low to-surface-container text-primary`}
        role="img"
        aria-label={alt}
      >
        <span className="material-symbols-outlined text-[24px]">{fallbackIcon}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
