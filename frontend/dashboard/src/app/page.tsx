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
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState<{ [key: string]: { message: string; isError: boolean, url?: string } | null }>({});
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    async function fetchAuthStatus() {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        setLoggedIn(data.loggedIn);
      } catch (err) {
        // Ignore errors
      }
    }

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        await fetchAuthStatus();
        const templatesRes = await fetch('/api/templates');
        if (!templatesRes.ok) {
          throw new Error('Failed to fetch templates');
        }
        const templatesData = await templatesRes.json();
        setTemplates(templatesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleCreateRepository = async (templateId: string) => {
    if (!projectName) {
      setCreationStatus({ ...creationStatus, [templateId]: { message: 'Project name is required', isError: true } });
      return;
    }

    setIsCreating(true);
    setCreationStatus({ ...creationStatus, [templateId]: { message: 'Creating repository...', isError: false } });

    try {
      const res = await fetch('/api/repositories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          template: templateId,
          config: {
            projectDescription,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create repository');
      }

      const data = await res.json();
      setCreationStatus({ ...creationStatus, [templateId]: { message: 'Repository created successfully!', isError: false, url: data.url } });
    } catch (err) {
      setCreationStatus({ ...creationStatus, [templateId]: { message: err instanceof Error ? err.message : 'An unknown error occurred', isError: true } });
    } finally {
      setIsCreating(false);
      setProjectName('');
      setProjectDescription('');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setLoggedIn(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">Rainar</h1>
        {loggedIn && <button onClick={handleLogout} className="rounded-md bg-gray-500 px-4 py-2 text-white">Logout</button>}
      </div>

      <div className="mt-12 w-full max-w-5xl">
        <h2 className="text-2xl font-semibold">Available Templates</h2>
        {loading && <p className="mt-4">Loading...</p>}
        {error && <p className="mt-4 text-red-500">{error}</p>}
        {templates.length > 0 && (
          <div className="mt-4 space-y-4">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-gray-300 bg-gray-100 p-4">
                <h3 className="text-lg font-semibold">{template.name}</h3>
                <p className="mt-2 text-gray-600">{template.description}</p>
                <div className="mt-4 flex flex-col space-y-4">
                  <div className="flex items-center space-x-4">
                    <input
                      type="text"
                      placeholder="Project Name"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="flex-grow rounded-md border border-gray-300 p-2"
                    />
                    <input
                      type="text"
                      placeholder="Project Description"
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      className="flex-grow rounded-md border border-gray-300 p-2"
                    />
                  </div>
                  {loggedIn ? (
                    <button
                      onClick={() => handleCreateRepository(template.id)}
                      disabled={isCreating}
                      className="rounded-md bg-blue-500 px-4 py-2 text-white disabled:bg-gray-400"
                    >
                      {isCreating ? 'Creating...' : 'Create GitHub Repository'}
                    </button>
                  ) : (
                    <a
                      href="/api/auth/github"
                      className="rounded-md bg-gray-800 px-4 py-2 text-center text-white"
                    >
                      Login with GitHub to Create Repository
                    </a>
                  )}
                </div>
                {creationStatus[template.id] && (
                  <p className={`mt-2 ${creationStatus[template.id]?.isError ? 'text-red-500' : 'text-green-500'}`}>
                    {creationStatus[template.id]?.message}
                    {creationStatus[template.id]?.url && (
                      <a
                        href={creationStatus[template.id]?.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-500 underline"
                      >
                        View Repository
                      </a>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
