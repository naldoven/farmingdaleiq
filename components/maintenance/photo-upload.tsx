"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Direct photo upload for the Maintenance module, replacing the old
 * paste-a-URL fields. Files go straight from the browser to the public
 * `maintenance-photos` bucket (supabase/migrations/
 * 20260803000000_maintenance_photos_bucket.sql) on the anon client —
 * storage RLS re-checks maintenance.request — and the resulting public
 * URLs flow through the existing photoUrls/photoUrl action inputs
 * unchanged. Uploading client-side rather than through a server action
 * keeps multi-MB phone photos out of the server-action body-size limit.
 */

const BUCKET = "maintenance-photos";
const MAX_BYTES = 10 * 1024 * 1024; // mirrors the bucket's file_size_limit

// Mirrors the bucket's allowed_mime_types: picks the stored extension and
// fails a bad pick with a friendly message instead of a storage 4xx.
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function Thumb({ url }: { url: string }) {
  return (
    // User-uploaded storage URLs: next/image would need remotePatterns + the
    // optimizer for no gain on 80px thumbnails.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Photo"
      loading="lazy"
      className="h-20 w-20 rounded-md border border-border object-cover"
    />
  );
}

/** Read-only thumbnail row; each photo opens full-size in a new tab. */
export function PhotoStrip({ photos }: { photos: string[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          <Thumb url={url} />
        </a>
      ))}
    </div>
  );
}

export function PhotoUpload({
  photos,
  onChange,
  folder,
  max = 6,
  onBusyChange,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  /** Path prefix inside the bucket, e.g. "requests" | "comments" | "invoices". */
  folder: string;
  max?: number;
  /** Lets the parent form disable its submit button mid-upload. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, max - photos.length);
    if (files.length === 0) return;
    setError(null);
    setIsUploading(true);
    onBusyChange?.(true);
    try {
      const supabase = createClient();
      const uploaded: string[] = [];
      for (const file of files) {
        const extension = EXTENSION_BY_MIME[file.type];
        if (!extension) {
          setError("Only photos (JPEG, PNG, WebP, GIF, HEIC) can be uploaded.");
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError("Photos must be under 10 MB.");
          continue;
        }
        const path = `${folder}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          cacheControl: "31536000",
        });
        if (uploadError) {
          setError("Could not upload the photo. Check your connection and try again.");
          break;
        }
        uploaded.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }
      if (uploaded.length > 0) onChange([...photos, ...uploaded]);
    } finally {
      setIsUploading(false);
      onBusyChange?.(false);
      // Reset so picking the same file again re-fires onChange.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <div key={url} className="relative">
              <Thumb url={url} />
              <button
                type="button"
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-[13px] leading-none text-muted-foreground shadow-sm"
                onClick={() => onChange(photos.filter((p) => p !== url))}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      {photos.length < max && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? "Uploading..." : photos.length > 0 ? "Add another photo" : "Add photo"}
          </Button>
        </div>
      )}
      {/* accept="image/*" with no capture attr: phones offer both "Take
          Photo" and the camera roll. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="hidden"
        onChange={(e) => uploadFiles(e.target.files)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
