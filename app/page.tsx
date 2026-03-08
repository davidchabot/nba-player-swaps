"use client";

import { useState, useEffect, useCallback } from "react";
import { ScanningInterface } from "@/components/scanning-interface";
import { StreamingDashboard } from "@/components/streaming-dashboard";

interface ScannedAvatar {
  id: string;
  name: string;
  thumbnail: string;
}

export default function Home() {
  const [showScanner, setShowScanner] = useState(false);
  const [avatars, setAvatars] = useState<ScannedAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load avatars from database on mount
  const loadAvatars = useCallback(async () => {
    try {
      const res = await fetch('/api/avatars');
      if (res.ok) {
        const data = await res.json();
        const formattedAvatars: ScannedAvatar[] = data.map((avatar: any) => ({
          id: avatar.id,
          name: avatar.name,
          thumbnail: avatar.thumbnailUrl || '',
        }));
        setAvatars(formattedAvatars);
      }
    } catch (error) {
      console.error('Failed to load avatars:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAvatars();
  }, [loadAvatars]);

  const handleScanComplete = async (name: string, imageData?: string) => {
    try {
      const formData = new FormData();
      formData.append('name', name || `Avatar ${avatars.length + 1}`);

      // If imageData is a base64 string, convert to blob
      if (imageData && imageData.startsWith('data:')) {
        const response = await fetch(imageData);
        const blob = await response.blob();
        formData.append('image', blob, 'avatar.jpg');
      }

      const res = await fetch('/api/avatars', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const avatar = await res.json();
        const newAvatar: ScannedAvatar = {
          id: avatar.id,
          name: avatar.name,
          thumbnail: avatar.thumbnailUrl || '',
        };
        setAvatars((prev) => [newAvatar, ...prev]);
      } else {
        // Fallback to local-only avatar if API fails
        const newAvatar: ScannedAvatar = {
          id: Date.now().toString(),
          name: name || `Avatar ${avatars.length + 1}`,
          thumbnail: imageData || '',
        };
        setAvatars((prev) => [newAvatar, ...prev]);
      }
    } catch (error) {
      console.error('Failed to save avatar:', error);
      // Fallback to local-only avatar
      const newAvatar: ScannedAvatar = {
        id: Date.now().toString(),
        name: name || `Avatar ${avatars.length + 1}`,
        thumbnail: imageData || '',
      };
      setAvatars((prev) => [newAvatar, ...prev]);
    }

    setShowScanner(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <StreamingDashboard
        avatars={avatars}
        onAddAvatar={() => setShowScanner(true)}
      />

      {showScanner && (
        <ScanningInterface
          onClose={() => setShowScanner(false)}
          onScanComplete={handleScanComplete}
        />
      )}
    </>
  );
}
