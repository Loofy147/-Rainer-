"use client";

import { useState, useEffect } from 'react';

interface Template {
  id: string;
  name: string;
  description: string;
}

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch('/api/templates');
        if (!res.ok) {
          throw new Error('Failed to fetch templates');
        }
        const data = await res.json();
        setTemplates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">Rainar</h1>
      </div>

      <div className="mt-12 w-full max-w-5xl">
        <h2 className="text-2xl font-semibold">Available Templates</h2>
        {loading && <p className="mt-4">Loading...</p>}
        {error && <p className="mt-4 text-red-500">{error}</p>}
        {templates.length > 0 && (
          <ul className="mt-4 space-y-4">
            {templates.map((template) => (
              <li key={template.id} className="rounded-lg border border-gray-300 bg-gray-100 p-4">
                <h3 className="text-lg font-semibold">{template.name}</h3>
                <p className="mt-2 text-gray-600">{template.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
