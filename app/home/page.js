"use client";
import React, { use } from "react";
import { supabase } from "../lib/supabaseclient";
import { useEffect, useState } from "react";
import Comments from "../../components/comments";
export default function Home() {
  const [user, setUser] = useState(null);
  const [Posts, setPosts] = useState([]); //state to hold posts from database
  const [votesByPost, setVotesByPost] = useState({}); // { [postId]: 'up' | 'down' }
  const [votingInProgress, setVotingInProgress] = useState({}); // { [postId]: boolean }
  const [voteError, setVoteError] = useState(null); // error message

  const fetchPosts = async (searchQuery = "") => {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .ilike("title", `%${searchQuery}%`)
      .order("created_at", { ascending: false });
    setPosts(data || []); //sets posts to data fetched from database
    if (error) {
      console.error("Error fetching posts:", error);
    }
  };

  useEffect(() => {}, []);
  useEffect(() => {
    // Extract query parameters from the current URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionKey = urlParams.get("accessid");
    const searchQuery = urlParams.get("search") || "";
    fetchPosts(searchQuery);

    // Case 1: Use localStorage if user is already saved and no new sessionKey
    const savedUser = localStorage.getItem("user");
    if (savedUser && !sessionKey) {
      setUser(JSON.parse(savedUser));
      return; // Exit early
    }

    // Case 2: If sessionKey exists (fresh login from SSO)
    if (sessionKey) {
      fetch("https://sso.tech-iitb.org/project/getuserdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionKey }),
      })
        .then((res) => res.json())
        .then(async (data) => {
          console.log("User Data:", data);

          // Rebuild the object with your own fields
          const newData = {
            id: crypto.randomUUID(),
            name: data.name,
            roll: data.roll,
            department: data.department,
            degree: data.degree,
            role: "student",
          };

          //  STEP 1: Check if user already exists in Supabase
          const { data: existingUser, error: checkError } = await supabase
            .from("users")
            .select("*")
            .eq("roll", newData.roll)
            .maybeSingle(); // safer than .single() if no row exists

          if (checkError && checkError.code !== "PGRST116") {
            console.error("Error checking user:", checkError.message);
            return;
          }

          if (existingUser) {
            // IF user already exists
            console.log("User already exists:", existingUser);
            setUser(existingUser);
            localStorage.setItem("user", JSON.stringify(existingUser));
          } else {
            // ELSE: Insert the new user
            console.log("No existing user found. Inserting new one...");
            const { data: inserted, error: insertError } = await supabase
              .from("users")
              .insert([newData])
              .select()
              .single();

            if (insertError) {
              console.error("Supabase Insert Error:", insertError.message);
            } else {
              console.log("Inserted into Supabase:", inserted);
              setUser(inserted);
              localStorage.setItem("user", JSON.stringify(inserted));
            }
          }

          // Save sessionKey
          localStorage.setItem("sessionKey", sessionKey);
        })
        .catch((err) => console.error("Fetch error:", err));
    }
  }, []);

  // Load vote state for the current session/user from localStorage
  useEffect(() => {
    const currentSessionKey = localStorage.getItem("sessionKey") || "anon";
    const stored = localStorage.getItem(`votes:${currentSessionKey}`);
    try {
      const parsed = stored ? JSON.parse(stored) : {};
      setVotesByPost(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setVotesByPost({});
    }
  }, [user]);

  const getVote = (postId) => votesByPost[postId] || null; // 'up' | 'down' | null
  const setVote = (postId, value) => {
    setVotesByPost((prev) => {
      const next = { ...prev };
      if (value === null) delete next[postId];
      else next[postId] = value;
      const currentSessionKey = localStorage.getItem("sessionKey") || "anon";
      localStorage.setItem(`votes:${currentSessionKey}`, JSON.stringify(next));
      return next;
    });
  };

  const handleUpvote = async (post) => {
    // toggleable upvote with switch from downvote
    if (votingInProgress[post.id]) return; // Prevent double-clicks

    const current = getVote(post.id);
    let deltaUp = 0;
    let deltaDown = 0;
    let nextVote = null;
    if (current === "up") {
      // remove upvote
      deltaUp = -1;
      nextVote = null;
    } else if (current === "down") {
      // switch down -> up
      deltaUp = 1;
      deltaDown = -1;
      nextVote = "up";
    } else {
      // add upvote
      deltaUp = 1;
      nextVote = "up";
    }

    // Set loading state
    setVotingInProgress((prev) => ({ ...prev, [post.id]: true }));
    setVoteError(null);

    // Get the current post from state to ensure we have the latest values
    const currentPost = Posts.find((p) => p.id === post.id);
    if (!currentPost) {
      setVotingInProgress((prev) => ({ ...prev, [post.id]: false }));
      return;
    }

    const { error } = await supabase
      .from("posts")
      .update({
        upvotes: currentPost.upvotes + deltaUp,
        downvotes: currentPost.downvotes + deltaDown,
      })
      .eq("id", post.id);

    // Clear loading state
    setVotingInProgress((prev) => ({ ...prev, [post.id]: false }));

    if (error) {
      console.error(error);
      setVoteError("Failed to update vote. Please try again.");
      setTimeout(() => setVoteError(null), 3000); // Clear error after 3 seconds
    } else {
      // Only update UI after successful database operation
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                upvotes: p.upvotes + deltaUp,
                downvotes: p.downvotes + deltaDown,
              }
            : p
        )
      );
      setVote(post.id, nextVote);
    }
  };

  const handleDownvote = async (post) => {
    // toggleable downvote with switch from upvote
    if (votingInProgress[post.id]) return; // Prevent double-clicks

    const current = getVote(post.id);
    let deltaUp = 0;
    let deltaDown = 0;
    let nextVote = null;
    if (current === "down") {
      // remove downvote
      deltaDown = -1;
      nextVote = null;
    } else if (current === "up") {
      // switch up -> down
      deltaUp = -1;
      deltaDown = 1;
      nextVote = "down";
    } else {
      // add downvote
      deltaDown = 1;
      nextVote = "down";
    }

    // Set loading state
    setVotingInProgress((prev) => ({ ...prev, [post.id]: true }));
    setVoteError(null);

    // Get the current post from state to ensure we have the latest values
    const currentPost = Posts.find((p) => p.id === post.id);
    if (!currentPost) {
      setVotingInProgress((prev) => ({ ...prev, [post.id]: false }));
      return;
    }

    const { error } = await supabase
      .from("posts")
      .update({
        upvotes: currentPost.upvotes + deltaUp,
        downvotes: currentPost.downvotes + deltaDown,
      })
      .eq("id", post.id);

    // Clear loading state
    setVotingInProgress((prev) => ({ ...prev, [post.id]: false }));

    if (error) {
      console.error(error);
      setVoteError("Failed to update vote. Please try again.");
      setTimeout(() => setVoteError(null), 3000); // Clear error after 3 seconds
    } else {
      // Only update UI after successful database operation
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                upvotes: p.upvotes + deltaUp,
                downvotes: p.downvotes + deltaDown,
              }
            : p
        )
      );
      setVote(post.id, nextVote);
    }
  };

  console.log(Posts);

  const currentSearch =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("search") || ""
      : "";

  return (
    <>
      <div className="p-5 bg-white-100 min-h-130 justify-center items-center flex flex-col">
        {voteError && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {voteError}
          </div>
        )}

        {currentSearch && (
          <div className="mb-4 text-lg text-gray-700">
            Search results for: "
            <span className="font-semibold">{currentSearch}</span>"
          </div>
        )}

        {Posts.map(
          (
            post //maps through each post in the posts table in database
          ) => (
            <div
              key={post.id}
              className=" mx-auto w-2/3  my-4 p-4 rounded-lg flex flex-col gap-3  shadow-sm"
              style={{
                background: "linear-gradient(to right, #00bfff, #001f4d)",
                borderBottom: "4px solid #3288a5ff",
              }}
            >
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold ">{post.title}</h2>
                <div className="text-m rounded-full flex justify-center items-center bg-blue-400 p-1 w-20 text-center text-white">
                  {" "}
                  {post.flair}
                </div>
              </div>

              <p className="text-white-700 mb-4">{post.content}</p>
              {post.image_url && (
                <img src={post.image_url} className="justify-center" alt="" />
              )}
              <div className=" translate-y-8 w-full">
                <Comments postId={post.id} />
              </div>
              <div className="flex translate-y-8 gap-3 items-center">
                <img
                  src="upvote.svg"
                  onClick={() => {
                    handleUpvote(post);
                  }}
                  className={`rounded-full h-5 w-5 ${
                    votingInProgress[post.id]
                      ? "opacity-50 cursor-wait"
                      : "cursor-pointer"
                  } ${
                    getVote(post.id) === "up" ? "ring-2 ring-orange-500" : ""
                  }`}
                />
                {post.upvotes - post.downvotes}
                <img
                  src="downvote.svg"
                  onClick={() => {
                    handleDownvote(post);
                  }}
                  className={`rounded-full h-5 w-5 ${
                    votingInProgress[post.id]
                      ? "opacity-50 cursor-wait"
                      : "cursor-pointer"
                  } ${
                    getVote(post.id) === "down" ? "ring-2 ring-blue-500" : ""
                  }`}
                />
              </div>
              <div className="text-sm text-right text-grey-900">
                POSTED ON: {new Date(post.created_at).toLocaleDateString()}
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
}
