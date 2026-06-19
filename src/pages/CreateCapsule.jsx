import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  supabase,
  sendMessage,
  createNotification,
  isEmail,
  searchProfiles,
  addTreeGrowth,
  awardCapsuleCreated,
  awardCapsuleSent,
} from "../services/supabase";
import { logCapsuleSent } from "../services/worldTreeActivity";
import { useAuth } from "../contexts/AuthContext";
import { usePet, getLevel, getNextLevelXP } from "../contexts/PetContext";
import { playSound } from "../utils/sounds";
import "./CreateCapsule.css";
import createBg from "../assets/backgrounds/create-bg.jpg";
import coverLove       from "../covers/love.png";
import coverBirthday   from "../covers/birthday.png";
import coverFuture     from "../covers/future.png";
import coverGraduation from "../covers/graduation.png";

/* ── Content type options ── */
const CONTENT_TYPES = [
  { id: "text",  icon: "📝", label: "Text"  },
  { id: "photo", icon: "🖼️", label: "Photo" },
  { id: "video", icon: "▶️", label: "Video" },
  { id: "audio", icon: "🎙️", label: "Audio" },
  { id: "file",  icon: "📄", label: "File"  },
];

/* ── Cover options ── */
const COVERS = [
  { id: "love",       img: coverLove,       label: "Love"       },
  { id: "birthday",   img: coverBirthday,   label: "Birthday"   },
  { id: "future",     img: coverFuture,     label: "Future"     },
  { id: "graduation", img: coverGraduation, label: "Graduation" },
];

/* ── Step labels ── */
const STEPS = ["Content", "Details", "Preview"];

/* ── Accept maps per type ── */
const ACCEPT_MAP = {
  photo: "image/*",
  video: "video/*",
  audio: "audio/*",
  file:  "*/*",
};

/* ── Upload a single File to Supabase Storage, return public URL ── */
async function uploadFile(file) {
  if (!file || !(file instanceof File)) {
    throw new Error(`Invalid file object: ${JSON.stringify(file)}`);
  }

  const ext = file.name.split(".").pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  console.log("START UPLOAD", file.name, file.size, file.type);

  const { data: uploadData, error } = await supabase.storage
    .from("capsule-media")
    .upload(path, file);

  console.log("UPLOAD RESULT", uploadData);
  console.log("UPLOAD ERROR", error);

  if (error) throw error;

  const { data: publicData } = supabase.storage
    .from("capsule-media")
    .getPublicUrl(path);

  // FIX 5: expose the storage path so callers can delete orphaned files
  // if a later upload in the same batch fails.
  return {
    url:  publicData.publicUrl,
    path,                        // ← storage path for cleanup
    type: file.type,
    name: file.name,
  };
}

/* ── Generate a URL-safe slug for the capsule ──
   FIX 6: Was using Math.random() with no collision check, causing rare but
   unrecoverable insert failures. Now retries up to 5 times with a DB check,
   then falls back to a base-36 timestamp (guaranteed unique). ── */
async function generateUniqueSlug(title, supabaseClient) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "capsule";

  for (let attempt = 0; attempt < 5; attempt++) {
    const rand      = Math.random().toString(36).slice(2, 8);
    const candidate = `${base}-${rand}`;
    const { data }  = await supabaseClient
      .from("capsules")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;          // slug is free → use it
  }
  // Timestamp-based fallback: collision probability is effectively zero
  return `${base}-${Date.now().toString(36)}`;
}

/* ── MediaUploadZone ── */
function MediaUploadZone({ typeId, uploads, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const accept   = ACCEPT_MAP[typeId] || "*/*";

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach((f) => {
      const preview =
        f.type.startsWith("image/") || f.type.startsWith("video/")
          ? URL.createObjectURL(f)
          : null;
      onAdd({ file: f, preview, name: f.name, mimeType: f.type });
    });
    // reset so same file can be re-selected without triggering onChange again
    setTimeout(() => { e.target.value = ""; }, 0);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach((f) => {
      const preview = f.type.startsWith("image/") || f.type.startsWith("video/")
        ? URL.createObjectURL(f) : null;
      onAdd({ file: f, preview, name: f.name, mimeType: f.type });
    });
  };

  const isPhoto = typeId === "photo";
  const isVideo = typeId === "video";
  const isAudio = typeId === "audio";

  return (
    <div className="cc-upload-wrap">
      {/* Drop zone */}
      <div
        className="cc-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <span className="cc-dropzone-icon">
          {isPhoto ? "🖼️" : isVideo ? "▶️" : isAudio ? "🎙️" : "📄"}
        </span>
        <p className="cc-dropzone-text">
          Tap to add {typeId}{uploads.length > 0 ? " more" : ""}
        </p>
        <p className="cc-dropzone-sub">
          {isPhoto ? "JPG, PNG, GIF, WebP"
            : isVideo ? "MP4, MOV, WebM"
            : isAudio ? "MP3, M4A, WAV, OGG"
            : "Any file type"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
          onChange={handleFiles}
        />
      </div>

      {/* Previews */}
      {uploads.length > 0 && (
        <div className={`cc-preview-list ${isPhoto ? "cc-preview-list--grid" : ""}`}>
          {uploads.map((u, i) => (
            <div key={i} className="cc-preview-item">
              {isPhoto && u.preview && (
                <div className="cc-preview-photo-wrap">
                  <img src={u.preview} alt={u.name} className="cc-preview-photo" />
                  <button
                    className="cc-preview-remove"
                    onClick={() => onRemove(i)}
                    aria-label="Remove"
                  >✕</button>
                </div>
              )}
              {isVideo && u.preview && (
                <div className="cc-preview-video-wrap">
                  <video src={u.preview} className="cc-preview-video" muted playsInline />
                  <div className="cc-preview-video-badge">▶</div>
                  <button
                    className="cc-preview-remove"
                    onClick={() => onRemove(i)}
                    aria-label="Remove"
                  >✕</button>
                  <p className="cc-preview-filename">{u.name}</p>
                </div>
              )}
              {(isAudio || typeId === "file") && (
                <div className="cc-preview-file-row">
                  <span className="cc-preview-file-icon">
                    {isAudio ? "🎵" : "📄"}
                  </span>
                  <span className="cc-preview-file-name">{u.name}</span>
                  <button
                    className="cc-preview-remove cc-preview-remove--inline"
                    onClick={() => onRemove(i)}
                    aria-label="Remove"
                  >✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   Main component
══════════════════════════════════════════ */
function CreateCapsule() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Fix 6: consume the already-authenticated user from context instead of
  // calling supabase.auth.getUser() inside saveCapsule on every submission.
  const { user } = useAuth();
  const { triggerPetEvent, addXP, petXP } = usePet();

  /* recipient pre-fill from URL (e.g. ?shareWith=USERID&shareWithName=USERNAME) */
  const [shareWithUserId, setShareWithUserId] = useState(null);

  /* wizard state */
  const [step,    setStep]    = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  // Fix 7: track whether the draft was saved so the button label can update.
  const [draftSaved,     setDraftSaved]     = useState(false);
  // Set to true when a draft is restored from localStorage, so we can show
  // the "files weren't saved" banner in Step 1.
  const [draftRestored,  setDraftRestored]  = useState(false);

  // Fix 3: store the slug of the successfully saved capsule so we can navigate
  // to it when the Instagram modal is closed, preventing duplicate saves.
  const [savedCapsuleSlug, setSavedCapsuleSlug] = useState("");

  // Fix 3: guard flag — once the capsule has been inserted we flip this ref to
  // true.  Any subsequent click of "Send" (or Instagram / WhatsApp buttons)
  // while on the same page is a no-op redirect instead of a duplicate insert.
  const capsuleSavedRef = useRef(false);

  // Fix 4: timer handle for search debouncing.
  const searchDebounceRef = useRef(null);

  /* form fields */
  const [selectedTypes, setSelectedTypes] = useState(["text"]);
  const [message,       setMessage]       = useState("");
  const [senderName,    setSenderName]    = useState("");
  const [title,         setTitle]         = useState("");
  const [unlockDate,    setUnlockDate]    = useState("");
  const [unlockTime,    setUnlockTime]    = useState("");
  const [hint,          setHint]          = useState("");
  const [coverType,     setCoverType]     = useState("love");

  /* manual receiver fallback */
  const [receiverName,      setReceiverName]      = useState("");
  const [showManualReceiver,setShowManualReceiver] = useState(false);

  /* username search state */
  const [userSearchQuery,   setUserSearchQuery]   = useState("");
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchError,   setUserSearchError]   = useState("");
  const [selectedUserId,    setSelectedUserId]    = useState(null);
  const [selectedUserName,  setSelectedUserName]  = useState("");
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [selectedUserAvatar,setSelectedUserAvatar]= useState(null);
  const [showUserDropdown,  setShowUserDropdown]  = useState(false);

  /* share via Instagram modal */
  const [igModalVisible,    setIgModalVisible]    = useState(false);
  const [igCapsuleUrl,      setIgCapsuleUrl]      = useState("");
  const [igCopied,          setIgCopied]          = useState(false);

  /* media uploads: { photo: [], video: [], audio: [], file: [] } */
  const [uploads, setUploads] = useState({ photo: [], video: [], audio: [], file: [] });

  /* ── pre-fill recipient from URL params (sent from Messages chat) ──
     FIX 7: searchParams was missing from the dependency array, so if the URL
     changed while the page was mounted the recipient field would not update. ── */
  useEffect(() => {
    const shareWith = searchParams.get("shareWith");
    const shareName = searchParams.get("shareWithName");
    if (shareWith) {
      setShareWithUserId(shareWith);
      setSelectedUserId(shareWith);
      setSelectedUserName(shareName || "User");
      // Fetch the email for this user so receiver_email can be populated
      supabase
        .from("profiles")
        .select("email")
        .eq("id", shareWith)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.email) setSelectedUserEmail(data.email);
        });
    }
  }, [searchParams]);

  /* ── Fix 7: restore draft from localStorage on first mount ──
     Only runs once.  If a URL-based recipient is present it takes priority.
     NOTE: file uploads are never restored from a draft — the browser's object
     URL and File handle are gone after navigation.  A banner is shown in Step 1
     so the user knows to re-attach any files. ── */
  useEffect(() => {
    const raw = localStorage.getItem("capsule_draft");
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.selectedTypes)  setSelectedTypes(d.selectedTypes);
      if (d.message)        setMessage(d.message);
      if (d.senderName)     setSenderName(d.senderName);
      if (d.title)          setTitle(d.title);
      if (d.unlockDate)     setUnlockDate(d.unlockDate);
      if (d.unlockTime)     setUnlockTime(d.unlockTime);
      if (d.hint)           setHint(d.hint);
      if (d.coverType)      setCoverType(d.coverType);
      if (d.receiverName)   { setReceiverName(d.receiverName); setShowManualReceiver(true); }
      // Signal that a draft was loaded so we can show the media-not-restored banner.
      setDraftRestored(true);
    } catch {
      // Corrupt draft — silently ignore.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── revoke object URLs on unmount ──
     FIX 1: The cleanup function closed over the *initial* (empty) uploads value
     because the dependency array was []. Using a ref that shadows the latest
     state means the cleanup always sees the current file list, preventing the
     browser memory leak that grew with every photo/video added. ── */
  const uploadsRef = useRef(uploads);
  useEffect(() => {
    uploadsRef.current = uploads;      // keep ref in sync on every render
  }, [uploads]);

  useEffect(() => {
    return () => {
      Object.values(uploadsRef.current).flat().forEach((u) => {
        if (u.preview) URL.revokeObjectURL(u.preview);
      });
    };
  }, []);                              // intentionally empty – runs only on unmount

  /* ── Fix: cancel any in-flight search timer on unmount ──
     Without this, if the user types and immediately navigates away, the 300 ms
     timer fires on a dead component and React logs:
     "Warning: Can't perform a React state update on an unmounted component." ── */
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []); // intentionally empty – cleanup only

  /* ── helpers ── */
  const toggleType = (id) => {
    setSelectedTypes((prev) => {
      const isRemoving = prev.includes(id);
      // FIX 4: clear message text when the "text" content type is deselected so
      // a stale message is never silently saved with a non-text capsule.
      if (id === "text" && isRemoving) setMessage("");
      return isRemoving ? prev.filter((t) => t !== id) : [...prev, id];
    });
  };

  const addUpload = (typeId, item) => {
    setUploads((prev) => ({ ...prev, [typeId]: [...prev[typeId], item] }));
  };

  const removeUpload = (typeId, index) => {
    setUploads((prev) => {
      const next = [...prev[typeId]];
      if (next[index]?.preview) URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return { ...prev, [typeId]: next };
    });
  };

  const clearShareWith = () => {
    setShareWithUserId(null);
    setSelectedUserId(null);
    setSelectedUserName("");
    setSelectedUserEmail("");
    setSelectedUserAvatar(null);
    setUserSearchQuery("");
    setUserSearchResults([]);
    setUserSearchError("");
    setReceiverName("");
    setShowManualReceiver(false);
  };

  /* ── user search (Fix 4: debounced 300 ms to prevent race conditions)
     FIX 8: root-cause fixes for "search shows no results":
       1. The query previously matched `display_name` only. The field is
          labelled "Search by username…", so it now matches BOTH
          `username` and `display_name` (via the searchProfiles helper).
       2. The query previously did `const { data } = await supabase...`,
          discarding `error`. Supabase/PostgREST does NOT throw on RLS or
          query errors — it returns `{ data: null, error }` — so any
          failure (including a misconfigured RLS policy on `profiles`)
          silently produced an empty result with the `try/catch` never
          firing. Errors are now captured, logged, and surfaced via
          `userSearchError` so the dropdown can show a real failure
          message instead of just looking "empty".
       3. The current user is excluded from their own search results. ── */
  const searchUsers = (query) => {
    setUserSearchQuery(query);
    setUserSearchError("");

    if (!query.trim()) {
      setUserSearchResults([]);
      setShowUserDropdown(false);
      // Cancel any pending search when the field is cleared.
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }
    setShowUserDropdown(true);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      setUserSearchLoading(true);
      const { data, error } = await searchProfiles(query, user?.id);
      if (error) {
        setUserSearchResults([]);
        setUserSearchError("Couldn't load results. Please try again.");
      } else {
        setUserSearchResults(data);
        setUserSearchError("");
      }
      setUserSearchLoading(false);
    }, 300);
  };

  const selectUser = (user) => {
    setSelectedUserId(user.id);
    setSelectedUserName(user.display_name || user.username);
    setSelectedUserEmail(user.email || "");
    setSelectedUserAvatar(user.avatar_url);
    setShareWithUserId(user.id);
    setUserSearchQuery("");
    setUserSearchResults([]);
    setUserSearchError("");
    setShowUserDropdown(false);
  };

  const totalUploads = Object.values(uploads).flat().length;

  const selectedCover = COVERS.find((c) => c.id === coverType) || COVERS[0];

  // NOTE: type="date" and type="time" return ISO strings (YYYY-MM-DD / HH:MM) on
  // all modern mobile browsers (Android 5+, iOS 7+) and current desktop browsers.
  // If a user reports "Invalid Date" on an older device, swap these for date-fns
  // parse() calls.  Until then, the native format assumption is safe for the
  // target audience.
  //
  // TIMEZONE FIX: `new Date("YYYY-MM-DDTHH:MM")` — a string with no UTC offset —
  // is parsed by all WHATWG-compliant browsers as LOCAL time (the user's device
  // timezone). Calling `.toISOString()` converts that local instant to UTC and
  // appends "Z", giving Supabase an unambiguous UTC timestamp.
  // e.g. user in IST picks 20:25 → stored as "2026-06-14T14:55:00.000Z" (UTC).
  const unlockDateTimeString = (() => {
    if (!unlockDate) return "";
    const localStr = unlockTime ? `${unlockDate}T${unlockTime}` : `${unlockDate}T00:00`;
    const asUtc = new Date(localStr);
    return isNaN(asUtc.getTime()) ? "" : asUtc.toISOString();
  })();

  const unlockDateDisplay = unlockDate
    ? new Date(`${unlockDate}T${unlockTime || "00:00"}`).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "—";

  const unlockTimeDisplay = unlockTime
    ? new Date(`2000-01-01T${unlockTime}`).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  /* ── validation ── */
  const messageRequired = selectedTypes.includes("text");
  const messageValid    = !messageRequired || message.trim().length > 0;
  const canProceedStep1 = selectedTypes.length > 0 && messageValid;

  // FIX 3: reject past unlock dates so the capsule doesn't unlock immediately.
  // Evaluate against Date.now() at render time; re-evaluates on every state change.
  //
  // TIMEZONE FIX: reuse unlockDateTimeString (already a UTC ISO string) so that
  // validation and the value stored in Supabase are computed from the same instant.
  // Previously this re-parsed the raw local string, which could disagree with the
  // UTC-converted value and allow a time that "passes" validation to arrive in
  // Supabase already in the past after the offset is applied.
  const unlockDateTimeMs = unlockDateTimeString
    ? new Date(unlockDateTimeString).getTime()
    : 0;
  const isUnlockInFuture = unlockDateTimeMs > Date.now();

  const canProceedStep2 =
    senderName.trim() && title.trim() && unlockDate && unlockTime &&
    isUnlockInFuture &&
    (selectedUserId || receiverName.trim());

  /* ── Fix 7: Save current wizard state as a draft in localStorage ── */
  const saveDraft = () => {
    const draft = {
      selectedTypes,
      message,
      senderName,
      title,
      unlockDate,
      unlockTime,
      hint,
      coverType,
      receiverName,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem("capsule_draft", JSON.stringify(draft));
      setDraftSaved(true);
      // Return to the details step so the user can keep editing.
      setStep(2);
      setTimeout(() => setDraftSaved(false), 2500);
    } catch {
      // Storage quota exceeded or private-browsing restriction — degrade
      // gracefully by just navigating back to the details step.
      setStep(2);
    }
  };

  /* ── submit ── */
  const saveCapsule = async ({ shareVia } = {}) => {
    // Fix 3: if we already saved this capsule (e.g. user shared via Instagram
    // then clicked Send again), redirect instead of creating a duplicate.
    if (capsuleSavedRef.current) {
      navigate(
        savedCapsuleSlug
          ? `/capsule/${savedCapsuleSlug}`
          : selectedUserId
            ? `/messages?userId=${selectedUserId}&userName=${encodeURIComponent(selectedUserName || "User")}`
            : "/"
      );
      return;
    }

    console.log("HANDLE SUBMIT START");
    setError("");
    setSaving(true);

    /* 1. Upload all media files */
    const allFiles = Object.values(uploads).flat();
    const uploadedMedia = [];

    // FIX 5: track storage paths so we can delete any already-uploaded files
    // if a later file in the same batch fails, preventing orphaned billing.
    const uploadedPaths = [];

    if (allFiles.length > 0) {
      console.log("BEFORE MEDIA UPLOAD");
      setUploadProgress(`Uploading media (0 / ${allFiles.length})…`);
      for (let i = 0; i < allFiles.length; i++) {
        try {
          setUploadProgress(`Uploading media (${i + 1} / ${allFiles.length})…`);
          const result = await uploadFile(allFiles[i].file);
          uploadedPaths.push(result.path);   // FIX 5: record path immediately
          uploadedMedia.push(result);
        } catch (err) {
          // FIX 5: clean up the files that did succeed before aborting
          if (uploadedPaths.length > 0) {
            try {
              await supabase.storage.from("capsule-media").remove(uploadedPaths);
              console.log("Cleaned up orphaned uploads:", uploadedPaths);
            } catch (cleanupErr) {
              console.error("Orphan cleanup failed:", cleanupErr);
            }
          }
          setError(`Upload failed: ${err.message}`);
          setSaving(false);
          setUploadProgress("");
          return;
        }
      }
      console.log("AFTER MEDIA UPLOAD");
      console.log(uploadedMedia);
    }

    setUploadProgress("Saving capsule…");

    /* 2. Insert capsule row */
    // FIX 6: replaced Math.random() slug (no collision check) with an async
    // function that verifies uniqueness in the DB before committing.
    const slug = await generateUniqueSlug(title, supabase);

    // Fix 6: use the user object from AuthContext — no redundant network call.
    if (!user) {
      setError("You must be logged in to create a capsule.");
      setSaving(false);
      setUploadProgress("");
      return;
    }
    const currentUserId = user.id;
    console.log("🔐 Authenticated user.id for new capsule:", currentUserId);

    // ── Resolve recipient identity ───────────────────────────────────────────
    // - selectedUserId / selectedUserName come from the username search and
    //   refer to a real TimeLock account → receiver_id + receiver_name.
    // - receiverName (manual entry) is free text. If it looks like an email
    //   we store it as receiver_email; otherwise it goes into receiver_name.
    // receiver_email must NEVER hold a UUID or a plain display name.
    const manualReceiverIsEmail = !selectedUserId && isEmail(receiverName.trim());

    // FIX: receiver_id is ONLY set when we have a real authenticated user selected
    const recipientId = selectedUserId || null;

    // FIX: receiver_name is ALWAYS set to the human-readable name — never a UUID,
    // never null when we have any name information at all.
    const recipientName =
      (selectedUserId && selectedUserName)
        ? selectedUserName                                   // selected TimeLock user
        : (!manualReceiverIsEmail && receiverName.trim())
          ? receiverName.trim()                              // free-text name
          : null;                                            // email-only recipient

    // FIX: receiver_email holds a real email address only.
    // For a registered TimeLock user, use their stored email.
    // For manual entry, use it only when it looks like an email address.
    // IMPORTANT: receiver_email is NOT NULL in the DB — always fall back to ""
    // (empty string) rather than null so the insert never fails the constraint.
    const recipientEmail = selectedUserId
      ? selectedUserEmail || ""            // registered user → their profile email, or ""
      : manualReceiverIsEmail
        ? receiverName.trim()              // manual email entry
        : "";                              // manual name-only entry → "" not null
    // ──────────────────────────────────────────────────────────────────────────

    const payload = {
      sender_id:      currentUserId,   // ← belt-and-suspenders for RLS policy
      sender_name:    senderName.trim(),
      receiver_id:    recipientId,     // real TimeLock user UUID, or null
      receiver_name:  recipientName,   // human-readable "To:" — never a UUID
      receiver_email: recipientEmail,  // real email only, or null
      title:          title.trim(),
      // Ghost-message fix: if the user has deselected the "Text" content type,
      // do not persist whatever is still in the textarea.  toggleType() clears
      // the field on deselect, but a user could re-type after deselecting, so
      // this gate is the authoritative guard at the persistence boundary.
      message:        selectedTypes.includes("text") ? message : "",
      hint:           hint,
      cover_type:     coverType,
      unlock_date:    unlockDateTimeString,
      content_types:  selectedTypes,
      media_urls:     uploadedMedia.map((m) => m.url),
      media_types:    uploadedMedia.map((m) => m.type),
      slug,
    };

    console.log("receiver_email =", recipientEmail);
    console.log("INSERTING", payload);

    const { data, error: err } = await supabase
      .from("capsules")
      .insert([payload])
      .select();

    console.log("INSERT DATA", data);
    console.log("INSERT ERROR", err);

    setSaving(false);
    setUploadProgress("");

    if (err) { setError(err.message); return; }

    // Fix 3: mark this capsule as saved so any subsequent button press on this
    // page redirects instead of inserting a duplicate.
    const savedSlug = data?.[0]?.slug || slug;
    const savedCapsuleId = data?.[0]?.id || null;
    capsuleSavedRef.current = true;
    setSavedCapsuleSlug(savedSlug);

    // 🌳 World Tree — +100 growth for creating a capsule.
    // addTreeGrowth is the primary path (direct insert + world_tree update).
    // awardCapsuleCreated (RPC-based, dedup-guarded) is the belt-and-suspenders
    // fallback. Both are non-blocking fire-and-forget so capsule creation never
    // stalls or fails because of a World Tree write.
    if (currentUserId) {
      // Primary: direct contribution row + global growth counter
      addTreeGrowth(currentUserId, 100, 'create_capsule').catch((e) =>
        console.warn("[WorldTree] addTreeGrowth(create_capsule) failed silently:", e)
      );
      // Dedup-guarded RPC fallback (uses reference_id to prevent double-award)
      if (savedCapsuleId) {
        awardCapsuleCreated(currentUserId, savedCapsuleId).catch((e) =>
          console.warn("[WorldTree] awardCapsuleCreated failed silently:", e)
        );
      }
    }

    // Fix 7: remove the draft now that it has been successfully submitted.
    try { localStorage.removeItem("capsule_draft"); } catch { /* ignore */ }

    // 🔊 Play send sound on successful capsule creation
    playSound("capsuleSend");

    // ⭐ Lumi XP reward — 70 % of the XP required to complete the current level
    const currentLevel  = getLevel(petXP);
    const xpNeededThisLevel = getNextLevelXP(petXP);          // XP to advance from currentLevel → next
    const rewardXP      = Math.round(xpNeededThisLevel * 0.7);
    addXP(rewardXP);
    try {
      localStorage.setItem(
        "pet_xp_reward",
        JSON.stringify({ type: "capsule_created", rewardXP, timestamp: Date.now() }),
      );
    } catch {
      console.warn("[CreateCapsule] Could not persist Lumi reward event.");
    }

    // 🐾 Lumi jumps and shoots confetti
    triggerPetEvent("capsuleCreated");
    const capsuleUrl = `${window.location.origin}/capsule/${savedSlug}`;

    /* ── Helper: send an in-app capsule notification message ── */
    // FIX: always pass messageType = 'capsule' so the JSON payload is stored
    // correctly and the chat UI can render a capsule card instead of blank text.
    const sendCapsuleMessage = async () => {
      if (!selectedUserId || !data?.[0]) return;
      try {
        const capsuleData = {
          id:         data[0].id,
          title:      data[0].title,
          slug:       data[0].slug,
          cover_type: data[0].cover_type,
          unlock_date:data[0].unlock_date,
        };
        await sendMessage(
          currentUserId,   // reuse the already-resolved sender id — no second auth call
          selectedUserId,
          `📦 I sent you a time capsule: "${data[0].title}"`,  // human-readable fallback text
          "capsule",       // FIX: must be 'capsule', not 'text', to store structured JSON
          capsuleData,
        );

        // 🌳 World Tree — +150 growth for sending the capsule to a recipient
        // (dedup-guarded: same capsule id + 'send_capsule' won't fire twice)
        if (currentUserId && savedCapsuleId) {
          awardCapsuleSent(currentUserId, savedCapsuleId).catch((e) =>
            console.warn("[WorldTree] awardCapsuleSent failed silently:", e)
          );
          // 📝 Activity feed — log only, no growth side-effects of its own.
          // sendMessage() above already succeeded, so the capsule was
          // genuinely sent before this fires.
          logCapsuleSent(currentUserId, senderName.trim(), 150).catch((e) =>
            console.warn("[WorldTreeActivity] logCapsuleSent failed silently:", e)
          );
        }

        await createNotification(
          selectedUserId,
          "New Time Capsule 💌",
          `${senderName} sent you a time capsule`
        );
      } catch (msgErr) {
        console.error("Error sending capsule message:", msgErr);
      }
    };

    /* 3. Share via WhatsApp */
    if (shareVia === "whatsapp") {
      const waText = `I sent you a Time Capsule! It unlocks on ${unlockDateDisplay}. Open it here: ${capsuleUrl}`;
      const waWindow = window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank");

      // 🌳 World Tree — +150 for sharing via WhatsApp (counts as a send)
      if (currentUserId && savedCapsuleId) {
        awardCapsuleSent(currentUserId, savedCapsuleId).catch((e) =>
          console.warn("[WorldTree] awardCapsuleSent (whatsapp) failed silently:", e)
        );
        // 📝 Activity feed — fires only after the WhatsApp share action above
        // has already happened (waWindow was opened).
        logCapsuleSent(currentUserId, senderName.trim(), 150).catch((e) =>
          console.warn("[WorldTreeActivity] logCapsuleSent (whatsapp) failed silently:", e)
        );
      }

      // If the browser's popup blocker killed the window, fall back to showing
      // the capsule link inline rather than leaving the user on a saved-but-stuck
      // page with no way forward.  We still navigate away because the capsule has
      // been committed to the DB and a second click would create a duplicate.
      if (!waWindow) {
        setError(
          `WhatsApp was blocked by your browser. Share this link manually: ${capsuleUrl}`
        );
        setSaving(false);
        // Don't return — still send the in-app message and navigate normally so
        // the user can copy the URL from the error banner before we redirect.
        await sendCapsuleMessage();
        setTimeout(() => {
          if (selectedUserId) {
            navigate(`/messages?userId=${selectedUserId}&userName=${encodeURIComponent(selectedUserName || "User")}`);
          } else {
            navigate(`/capsule/${savedSlug}`);
          }
        }, 4000);        // give 4 s to read the error and copy the link
        return;
      }

      await sendCapsuleMessage();
      if (selectedUserId) {
        navigate(`/messages?userId=${selectedUserId}&userName=${encodeURIComponent(selectedUserName || "User")}`);
      } else {
        navigate(`/capsule/${savedSlug}`);
      }
      return;
    }

    /* 4. Share via Instagram */
    if (shareVia === "instagram") {
      // 🌳 World Tree — +150 for sharing via Instagram (counts as a send)
      if (currentUserId && savedCapsuleId) {
        awardCapsuleSent(currentUserId, savedCapsuleId).catch((e) =>
          console.warn("[WorldTree] awardCapsuleSent (instagram) failed silently:", e)
        );
        // 📝 Activity feed — fires only after the capsule was already saved
        // and the Instagram share flow has been initiated.
        logCapsuleSent(currentUserId, senderName.trim(), 150).catch((e) =>
          console.warn("[WorldTreeActivity] logCapsuleSent (instagram) failed silently:", e)
        );
      }
      setIgCapsuleUrl(capsuleUrl);
      setIgModalVisible(true);
      return;
    }

    /* 5. Normal send — message the recipient if selected */
    if (selectedUserId && data?.[0]) {
      await sendCapsuleMessage();
      navigate(`/messages?userId=${selectedUserId}&userName=${encodeURIComponent(selectedUserName || "User")}`);
      return;
    }

    navigate(`/capsule/${savedSlug}`);
  };

  /* ── render ── */
  return (
    <div className="cc-page" style={{ backgroundImage: `url(${createBg})` }}>
      <div className="cc-overlay" />

      {/* Header */}
      <div className="cc-header">
        <button
          className="cc-back-btn"
          onClick={() => (step > 1 ? setStep(step - 1) : navigate("/"))}
          aria-label="Back"
        >
          ←
        </button>
        <span className="cc-header-title">
          {step === 1 ? "Create Capsule" : step === 2 ? "Set Unlock Details" : "Preview Capsule"}
        </span>
        <div style={{ width: 36 }} />
      </div>

      {/* Progress stepper */}
      <div className="cc-stepper">
        {STEPS.map((label, i) => {
          const num    = i + 1;
          const done   = step > num;
          const active = step === num;
          return (
            <div key={label} className="cc-step-item">
              <div className={`cc-step-bubble ${done ? "done" : ""} ${active ? "active" : ""}`}>
                {done ? "✓" : num}
              </div>
              <span className={`cc-step-label ${active ? "active" : ""}`}>{label}</span>
              {i < STEPS.length - 1 && (
                <div className={`cc-step-line ${done ? "done" : ""}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ══ STEP 1 — Content ══ */}
      {step === 1 && (
        <div className="cc-body">
          <h2 className="cc-question">What do you want<br />to send?</h2>

          {/* Draft-restored notice — shown only when localStorage draft was loaded */}
          {draftRestored && (
            <div className="cc-draft-banner">
              <span className="cc-draft-banner-icon">📋</span>
              <span className="cc-draft-banner-text">
                Draft restored.&nbsp;
                <strong>Files aren't saved in drafts</strong> — please re-attach any photos, videos, or other files.
              </span>
              <button
                className="cc-draft-banner-dismiss"
                onClick={() => setDraftRestored(false)}
                aria-label="Dismiss"
              >✕</button>
            </div>
          )}

          <div className="cc-type-grid">
            {CONTENT_TYPES.map((ct) => (
              <button
                key={ct.id}
                className={`cc-type-card ${selectedTypes.includes(ct.id) ? "selected" : ""}`}
                onClick={() => toggleType(ct.id)}
              >
                {selectedTypes.includes(ct.id) && (
                  <span className="cc-type-check">✓</span>
                )}
                <span className="cc-type-icon">{ct.icon}</span>
                <span className="cc-type-label">{ct.label}</span>
                {/* badge for upload count */}
                {ct.id !== "text" && uploads[ct.id]?.length > 0 && (
                  <span className="cc-type-badge">{uploads[ct.id].length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Text message — always shown */}
          <div className="cc-field-wrap">
            <label className="cc-field-label">Your message</label>
            <textarea
              className="cc-textarea"
              placeholder="Write something meaningful…"
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
            <span className="cc-char-count">{message.length}/2000</span>
          </div>

          {/* Media upload zones — shown only when relevant type is selected */}
          {(["photo", "video", "audio", "file"]).map((typeId) =>
            selectedTypes.includes(typeId) ? (
              <div key={typeId} className="cc-upload-section">
                <p className="cc-section-label">
                  {CONTENT_TYPES.find((c) => c.id === typeId)?.icon}{" "}
                  {typeId.charAt(0).toUpperCase() + typeId.slice(1)}s
                </p>
                <MediaUploadZone
                  typeId={typeId}
                  uploads={uploads[typeId]}
                  onAdd={(item) => addUpload(typeId, item)}
                  onRemove={(idx) => removeUpload(typeId, idx)}
                />
              </div>
            ) : null
          )}

          <button
            className="cc-primary-btn"
            disabled={!canProceedStep1}
            onClick={() => setStep(2)}
          >
            Next &nbsp;→
          </button>
        </div>
      )}

      {/* ══ STEP 2 — Details ══ */}
      {step === 2 && (
        <div className="cc-body">
          <div className="cc-illustration">💎</div>
          <h2 className="cc-question">When should this<br />capsule be opened?</h2>

          <div className="cc-detail-row">
            <span className="cc-detail-icon">📅</span>
            <input
              className="cc-detail-input"
              type="date"
              value={unlockDate}
              onChange={(e) => setUnlockDate(e.target.value)}
            />
          </div>

          <div className="cc-detail-row">
            <span className="cc-detail-icon">🕙</span>
            <input
              className="cc-detail-input"
              type="time"
              value={unlockTime}
              onChange={(e) => setUnlockTime(e.target.value)}
            />
          </div>

          {/* Fix 5: show an inline warning when the chosen date/time is in the past */}
          {unlockDate && unlockTime && !isUnlockInFuture && (
            <p className="cc-error" style={{ marginTop: 4, marginBottom: 8 }}>
              ⚠️ Unlock time must be in the future.
            </p>
          )}

          <p className="cc-section-label">From</p>
          <div className="cc-glass-field">
            <span className="cc-glass-avatar">✍️</span>
            <div className="cc-glass-right">
              <input
                className="cc-inline-input"
                type="text"
                placeholder="Your name"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
              />
            </div>
          </div>

          <p className="cc-section-label">Capsule title</p>
          <div className="cc-glass-field">
            <span className="cc-glass-avatar">📦</span>
            <div className="cc-glass-right">
              <input
                className="cc-inline-input"
                type="text"
                placeholder="Give this capsule a name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          {/* Who is this for — username search */}
          <p className="cc-section-label">Who is this for?</p>
          <div className="cc-user-search-wrap" style={{ position: "relative" }}>
            {selectedUserId ? (
              /* Selected user chip */
              <div className="cc-user-chip">
                {selectedUserAvatar ? (
                  <img src={selectedUserAvatar} alt={selectedUserName} className="cc-user-chip-avatar" />
                ) : (
                  <span className="cc-user-chip-avatar-fallback">👤</span>
                )}
                <span className="cc-user-chip-name">{selectedUserName}</span>
                {!shareWithUserId && (
                  <button
                    type="button"
                    className="cc-user-chip-clear"
                    onClick={clearShareWith}
                    aria-label="Clear recipient"
                  >✕</button>
                )}
              </div>
            ) : (
              <>
                {/* Search input */}
                <div className="cc-user-search-field">
                  <span className="cc-user-search-icon">🔍</span>
                  <input
                    className="cc-user-search-input"
                    type="text"
                    placeholder="Search by username…"
                    value={userSearchQuery}
                    onChange={(e) => searchUsers(e.target.value)}
                    onFocus={() => userSearchQuery.trim() && setShowUserDropdown(true)}
                  />
                </div>

                {/* Manual name fallback */}
                {!showManualReceiver ? (
                  <button
                    type="button"
                    className="cc-manual-receiver-link"
                    onClick={() => setShowManualReceiver(true)}
                  >
                    or enter name manually
                  </button>
                ) : (
                  <div className="cc-glass-field" style={{ marginTop: 8 }}>
                    <span className="cc-glass-avatar">👤</span>
                    <div className="cc-glass-right">
                      <input
                        className="cc-inline-input"
                        type="text"
                        placeholder="Recipient's name or email"
                        value={receiverName}
                        onChange={(e) => setReceiverName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      className="cc-edit-btn"
                      onClick={() => { setShowManualReceiver(false); setReceiverName(""); }}
                      aria-label="Cancel manual entry"
                      title="Cancel"
                    >✕</button>
                  </div>
                )}
              </>
            )}

            {/* Dropdown results
                FIX 8: previously this only rendered when
                `userSearchLoading || userSearchResults.length > 0`, so a
                completed search with zero matches (e.g. due to an RLS
                policy silently filtering out other users' profiles)
                rendered NOTHING — the "recipient selection" appeared to
                vanish entirely with no feedback. Now the dropdown stays
                open while there's a query, showing "Searching…", a
                friendly error if the request failed, "No users found" for
                a genuine empty result, or the matching rows. */}
            {showUserDropdown && !selectedUserId && userSearchQuery.trim() && (
              <div className="cc-user-dropdown">
                {userSearchLoading ? (
                  <div className="cc-user-dropdown-empty">Searching…</div>
                ) : userSearchError ? (
                  <div className="cc-user-dropdown-empty">{userSearchError}</div>
                ) : userSearchResults.length > 0 ? (
                  userSearchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="cc-user-dropdown-row"
                      onClick={() => selectUser(user)}
                    >
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.display_name} className="cc-user-dropdown-avatar" />
                      ) : (
                        <span className="cc-user-dropdown-avatar-fallback">👤</span>
                      )}
                      <span className="cc-user-dropdown-name">{user.display_name || user.username}</span>
                    </button>
                  ))
                ) : (
                  <div className="cc-user-dropdown-empty">No users found</div>
                )}
              </div>
            )}
          </div>

          <p className="cc-section-label">Add a hint (optional)</p>
          <div className="cc-hint-wrap">
            <input
              className="cc-hint-input"
              type="text"
              placeholder="e.g. Our 5th Anniversary 💕"
              value={hint}
              maxLength={100}
              onChange={(e) => setHint(e.target.value)}
            />
            <span className="cc-hint-count">{hint.length}/100</span>
          </div>

          <p className="cc-section-label">Choose a cover</p>
          <div className="cc-cover-grid">
            {COVERS.map((cv) => (
              <button
                key={cv.id}
                className={`cc-cover-btn ${coverType === cv.id ? "selected" : ""}`}
                onClick={() => setCoverType(cv.id)}
                aria-label={cv.label}
              >
                {coverType === cv.id && (
                  <span className="cc-cover-check">✓</span>
                )}
                <img src={cv.img} alt={cv.label} className="cc-cover-img" />
                <span className="cc-cover-label">{cv.label}</span>
              </button>
            ))}
          </div>

          <button
            className="cc-primary-btn"
            disabled={!canProceedStep2}
            onClick={() => setStep(3)}
          >
            Preview Capsule &nbsp;→
          </button>
        </div>
      )}

      {/* ══ STEP 3 — Preview ══ */}
      {step === 3 && (
        <div className="cc-body">
          <div className="cc-preview-cover">
            <div className="cc-preview-glow" />
            <img
              src={selectedCover.img}
              alt={selectedCover.label}
              className="cc-preview-cover-img"
            />
          </div>

          <div className="cc-preview-card">
            <div className="cc-preview-row">
              <span className="cc-preview-icon-sm">👤</span>
              <div>
                <p className="cc-preview-field-label">To</p>
                {/* FIX: show the real recipient name, never a UUID */}
                <p className="cc-preview-field-value">
                  {selectedUserName || receiverName || "—"}
                </p>
              </div>
            </div>

            <div className="cc-preview-divider" />

            <div className="cc-preview-row">
              <span className="cc-preview-icon-sm">📅</span>
              <div>
                <p className="cc-preview-field-label">Unlocks on</p>
                <p className="cc-preview-field-value">
                  {unlockDateDisplay}{unlockTime ? `, ${unlockTimeDisplay}` : ""}
                </p>
              </div>
            </div>

            {hint ? (
              <>
                <div className="cc-preview-divider" />
                <div className="cc-preview-row">
                  <span className="cc-preview-icon-sm">💡</span>
                  <div>
                    <p className="cc-preview-field-label">Hint</p>
                    <p className="cc-preview-field-value">{hint}</p>
                  </div>
                </div>
              </>
            ) : null}

            <div className="cc-preview-divider" />

            <div className="cc-preview-row">
              <span className="cc-preview-icon-sm">📦</span>
              <div>
                <p className="cc-preview-field-label">Content</p>
                <p className="cc-preview-field-value">
                  {selectedTypes.map((t) => {
                    const ct    = CONTENT_TYPES.find((c) => c.id === t);
                    const count = t !== "text" ? uploads[t]?.length : null;
                    return ct
                      ? `${ct.icon} ${count != null ? `${count} ` : ""}${ct.label}`
                      : t;
                  }).join("  ·  ")}
                </p>
              </div>
            </div>

            {/* Media summary */}
            {totalUploads > 0 && (
              <>
                <div className="cc-preview-divider" />
                <div className="cc-preview-row">
                  <span className="cc-preview-icon-sm">🗂️</span>
                  <div>
                    <p className="cc-preview-field-label">Attachments</p>
                    <p className="cc-preview-field-value">
                      {totalUploads} file{totalUploads !== 1 ? "s" : ""} ready to upload
                    </p>
                    {/* Photo thumbnails strip */}
                    {uploads.photo.length > 0 && (
                      <div className="cc-preview-thumbs">
                        {uploads.photo.slice(0, 4).map((u, i) => (
                          <img key={i} src={u.preview} alt="" className="cc-preview-thumb" />
                        ))}
                        {uploads.photo.length > 4 && (
                          <div className="cc-preview-thumb-more">
                            +{uploads.photo.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {uploadProgress && (
            <div className="cc-upload-progress">
              <div className="cc-upload-progress-dot" />
              {uploadProgress}
            </div>
          )}

          {error && <p className="cc-error">{error}</p>}

          <button
            className="cc-primary-btn"
            onClick={() => saveCapsule()}
            disabled={saving}
          >
            {saving ? uploadProgress || "Sending…" : "Send Capsule 🚀"}
          </button>

          {/* Share via section */}
          <div className="cc-share-via-section">
            <p className="cc-share-via-label">— or share via —</p>
            <button
              className="cc-share-btn cc-share-btn--whatsapp"
              onClick={() => saveCapsule({ shareVia: "whatsapp" })}
              disabled={saving}
            >
              💬 WhatsApp
            </button>
            <button
              className="cc-share-btn cc-share-btn--instagram"
              onClick={() => saveCapsule({ shareVia: "instagram" })}
              disabled={saving}
            >
              📸 Instagram
            </button>
          </div>

          {/* Instagram modal */}
          {igModalVisible && (
            <div
              className="cc-ig-modal-backdrop"
              onClick={() => {
                setIgModalVisible(false);
                // Fix 3: capsule was already saved — navigate away so the user
                // cannot click "Send" again and create a duplicate.
                navigate(`/capsule/${savedCapsuleSlug}`);
              }}
            >
              <div className="cc-ig-modal" onClick={(e) => e.stopPropagation()}>
                <p className="cc-ig-modal-title">Share on Instagram</p>
                <p className="cc-ig-modal-desc">
                  Copy this link and paste it in your Instagram DM:
                </p>
                <div className="cc-ig-url-box">
                  <span className="cc-ig-url-text">{igCapsuleUrl}</span>
                </div>
                <button
                  className="cc-ig-copy-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(igCapsuleUrl);
                    setIgCopied(true);
                    setTimeout(() => setIgCopied(false), 2000);
                  }}
                >
                  {igCopied ? "✓ Copied!" : "Copy Link"}
                </button>
                <button
                  className="cc-ig-close-btn"
                  onClick={() => {
                    setIgModalVisible(false);
                    // Fix 3: navigate after closing so the page is not left in a
                    // saved-but-unlocked state where a second Send creates a duplicate.
                    navigate(`/capsule/${savedCapsuleSlug}`);
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Fix 7: actually save the draft to localStorage, then go back to Step 2 */}
          <button
            className="cc-ghost-btn"
            onClick={saveDraft}
            disabled={saving}
          >
            {draftSaved ? "✓ Draft Saved!" : "Save as Draft"}
          </button>
        </div>
      )}
    </div>
  );
}

export default CreateCapsule;
