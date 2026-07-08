"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SearchBarProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Accessible label for the search field. Defaults to the placeholder. */
  label?: string;
  containerClassName?: string;
}

/**
 * Rounded search input with a leading magnifier. Uses type="search" and a
 * proper label (visually hidden) so it is accessible on its own.
 */
export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  (
    { label, placeholder = "Search", className, containerClassName, id, ...props },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className={cn("relative", containerClassName)}>
        <label htmlFor={inputId} className="sr-only">
          {label ?? placeholder}
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink"
          aria-hidden="true"
        />
        <input
          ref={ref}
          id={inputId}
          type="search"
          placeholder={placeholder}
          className={cn(
            "h-11 w-full rounded-full border border-line bg-card pl-9 pr-4 text-[15px] text-ink placeholder:text-muted-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
SearchBar.displayName = "SearchBar";
