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
  const [creationStatus, setCreationStatus] = useState<{ [key: string]: { message: string; isError: boolean } | null }>({});

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
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

  const handleCreateProject = async (templateId: string) => {
    if (!projectName) {
      setCreationStatus({ ...creationStatus, [templateId]: { message: 'Project name is required', isError: true } });
      return;
    }

    setIsCreating(true);
    setCreationStatus({ ...creationStatus, [templateId]: { message: 'Downloading template...', isError: false } });

    try {
      const res = await fetch('/api/projects', {
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
        throw new Error(errorData.error || 'Failed to download template');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setCreationStatus({ ...creationStatus, [templateId]: { message: 'Template downloaded successfully!', isError: false } });
    } catch (err) {
      setCreationStatus({ ...creationStatus, [templateId]: { message: err instanceof Error ? err.message : 'An unknown error occurred', isError: true } });
    } finally {
      setIsCreating(false);
      setProjectName('');
      setProjectDescription('');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">Rainar</h1>
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
                  <button
                    onClick={() => handleCreateProject(template.id)}
                    disabled={isCreating}
                    className="rounded-md bg-blue-500 px-4 py-2 text-white disabled:bg-gray-400"
                  >
                    {isCreating ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
                {creationStatus[template.id] && (
                  <p className={`mt-2 ${creationStatus[template.id]?.isError ? 'text-red-500' : 'text-green-500'}`}>
                    {creationStatus[template.id]?.message}
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
