"use client";

import { useState, useEffect } from 'react';

interface Template {
  id: string;
  name: string;
  description: string;
  secrets?: { name: string; description: string }[];
  workflow_id?: string;
}

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState<{ [key: string]: { message: string; isError: boolean, url?: string, owner?: string, repo?: string } | null }>({});
  const [loggedIn, setLoggedIn] = useState(false);
  const [secrets, setSecrets] = useState<{ [key: string]: string }>({});

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
      setCreationStatus({ ...creationStatus, [templateId]: { message: 'Repository created successfully!', isError: false, url: data.url, owner: data.owner, repo: data.repo } });
    } catch (err) {
      setCreationStatus({ ...creationStatus, [templateId]: { message: err instanceof Error ? err.message : 'An unknown error occurred', isError: true } });
    } finally {
      setIsCreating(false);
      setProjectName('');
      setProjectDescription('');
    }
  };

  const handleSecretChange = (secretName: string, value: string) => {
    setSecrets({ ...secrets, [secretName]: value });
  };

  const handleSecretsSubmit = async (templateId: string, workflowId?: string) => {
    const status = creationStatus[templateId];
    if (!status || !status.owner || !status.repo) {
      return;
    }

    try {
      await fetch(`/api/repositories/${status.owner}/${status.repo}/secrets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secrets: Object.entries(secrets).map(([name, value]) => ({ name, value })),
        }),
      });
      setCreationStatus({ ...creationStatus, [templateId]: { ...status, message: 'Secrets submitted successfully! Triggering CI/CD pipeline...' } });

      if (workflowId) {
        await fetch(`/api/repositories/${status.owner}/${status.repo}/dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workflow_id: workflowId,
          }),
        });
        setCreationStatus({ ...creationStatus, [templateId]: { ...status, message: 'CI/CD pipeline triggered successfully! Polling for status...' } });

        const interval = setInterval(async () => {
          try {
            const res = await fetch(`/api/repositories/${status.owner}/${status.repo}/workflows/${workflowId}/status`);
            if (!res.ok) return; // a 404 might happen if the workflow hasn't started yet
            const data = await res.json();

            setCreationStatus(prev => {
              const currentStatus = prev[templateId];
              if (!currentStatus) return prev;

              if (data.status === 'completed') {
                clearInterval(interval);
                return {
                  ...prev,
                  [templateId]: { ...currentStatus, message: `CI/CD pipeline completed with status: ${data.conclusion}` }
                };
              } else {
                return {
                  ...prev,
                  [templateId]: { ...currentStatus, message: `CI/CD pipeline status: ${data.status}` }
                };
              }
            });
          } catch (e) {
            // Do nothing, just retry on the next interval
          }
        }, 1000);
      }
    } catch (err) {
      setCreationStatus({ ...creationStatus, [templateId]: { ...status, message: 'Failed to submit secrets', isError: true } });
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
                      name="name"
                      placeholder="Project Name"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="flex-grow rounded-md border border-gray-300 p-2"
                    />
                    <input
                      type="text"
                      name="description"
                      placeholder="Project Description"
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      className="flex-grow rounded-md border border-gray-300 p-2"
                    />
                    <select name="template" className="rounded-md border border-gray-300 p-2">
                      {templates.map(template => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </div>
                  {loggedIn ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleCreateRepository(template.id); }}>
                      <button
                        type="submit"
                        disabled={isCreating}
                        className="rounded-md bg-blue-500 px-4 py-2 text-white disabled:bg-gray-400"
                      >
                        {isCreating ? 'Creating...' : 'Create Project'}
                      </button>
                    </form>
                  ) : (
                    <a
                      href="/api/auth/github"
                      className="rounded-md bg-gray-800 px-4 py-2 text-center text-white"
                    >
                      <button>Login with GitHub</button>
                    </a>
                  )}
                </div>
                {creationStatus[template.id] && (
                  <div className={`mt-2 ${creationStatus[template.id]?.isError ? 'text-red-500' : 'text-green-500'}`}>
                    <p id="pipeline-status">
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
                    {creationStatus[template.id]?.url && template.secrets && (
                      <form id="secrets-form" className="mt-4" onSubmit={(e) => { e.preventDefault(); handleSecretsSubmit(template.id, template.workflow_id); }}>
                        <h4 className="font-semibold">Repository Secrets</h4>
                        {template.secrets.map((secret) => (
                          <div key={secret.name} className="mt-2">
                            <label className="block text-sm font-medium text-gray-700">{secret.name}</label>
                            <p className="text-xs text-gray-500">{secret.description}</p>
                            <input
                              type="password"
                              onChange={(e) => handleSecretChange(secret.name, e.target.value)}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            />
                          </div>
                        ))}
                        <button
                          type="submit"
                          className="mt-4 rounded-md bg-green-500 px-4 py-2 text-white"
                        >
                          Set Secrets & Run Pipeline
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
