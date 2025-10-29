"use client";
import React from "react";
import userSSOdata from "@/components/userSSOdata";

const Page = () => {
  const { userdata, loading, error, refresh } = userSSOdata();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">User Page</h1>

      {loading && <p className="text-gray-700">Checking SSO session...</p>}

      {error && (
        <div className="mb-4 text-red-700">
          <p className="font-semibold">SSO error:</p>
          <p>{error.message}</p>
          <div className="mt-2">
            <button
              onClick={refresh}
              className="px-3 py-1 rounded bg-gray-800 text-white"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && userdata && (
        <div>
          <h2 className="font-semibold">Signed-in user</h2>
          <pre className="text-black bg-white p-2 rounded">
            {JSON.stringify(userdata, null, 2)}
          </pre>
        </div>
      )}

      {!loading && !error && !userdata && (
        <div className="text-gray-700">No SSO user found. Please sign in.</div>
      )}
    </div>
  );
};

export default Page;
