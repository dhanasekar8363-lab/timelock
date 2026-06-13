import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, sendMessage, isEmail } from "../services/supabase";
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

  return {
    url: publicData.publicUrl,
    type: file.type,
    name: file.name,
  };
}

/* ── Generate a URL-safe slug for the capsule ── */
function generateSlug(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "capsule";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
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

  /* recipient pre-fill from URL (e.g. ?shareWith=USERID&shareWithName=USERNAME) */
  const [shareWithUserId, setShareWithUserId] = useState(null);

  /* wizard state */
  const [step,    setStep]    = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

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
  const [selectedUserId,    setSelectedUserId]    = useState(null);
  const [selectedUserName,  setSelectedUserName]  = useState("");
  const [selectedUserAvatar,setSelectedUserAvatar]= useState(null);
  const [showUserDropdown,  setShowUserDropdown]  = useState(false);

  /* share via Instagram modal */
  const [igModalVisible,    setIgModalVisible]    = useState(false);
  const [igCapsuleUrl,      setIgCapsuleUrl]      = useState("");
  const [igCopied,          setIgCopied]          = useState(false);

  /* media uploads: { photo: [], video: [], audio: [], file: [] } */
  const [uploads, setUploads] = useState({ photo: [], video: [], audio: [], file: [] });

  /* ── pre-fill recipient from URL params (sent from Messages chat) ── */
  useEffect(() => {
    const shareWith = searchParams.get("shareWith");
    const shareName = searchParams.get("shareWithName");
    if (shareWith) {
      setShareWithUserId(shareWith);
      setSelectedUserId(shareWith);
      setSelectedUserName(shareName || "User");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── revoke object URLs on unmount ── */
  useEffect(() => {
    return () => {
      Object.values(uploads).flat().forEach((u) => {
        if (u.preview) URL.revokeObjectURL(u.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── helpers ── */
  const toggleType = (id) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
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
    setSelectedUserAvatar(null);
    setUserSearchQuery("");
    setUserSearchResults([]);
    setReceiverName("");
    setShowManualReceiver(false);
  };

  /* ── user search ── */
  const searchUsers = async (query) => {
    setUserSearchQuery(query);
    if (!query.trim()) {
      setUserSearchResults([]);
      setShowUserDropdown(false);
      return;
    }
    setUserSearchLoading(true);
    setShowUserDropdown(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${query}%`)
        .limit(8);
      setUserSearchResults(data || []);
    } catch {
      setUserSearchResults([]);
    } finally {
      setUserSearchLoading(false);
    }
  };

  const selectUser = (user) => {
    setSelectedUserId(user.id);
    setSelectedUserName(user.display_name);
    setSelectedUserAvatar(user.avatar_url);
    setShareWithUserId(user.id);
    setUserSearchQuery("");
    setUserSearchResults([]);
    setShowUserDropdown(false);
  };

  const totalUploads = Object.values(uploads).flat().length;

  const selectedCover = COVERS.find((c) => c.id === coverType) || COVERS[0];

  const unlockDateTimeString = unlockDate && unlockTime
    ? `${unlockDate}T${unlockTime}`
    : unlockDate ? `${unlockDate}T00:00` : "";

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
  const canProceedStep2 =
    senderName.trim() && title.trim() && unlockDate && unlockTime &&
    (selectedUserId || receiverName.trim());

  /* ── submit ── */
  const saveCapsule = async ({ shareVia } = {}) => {
    console.log("HANDLE SUBMIT START");
    setError("");
    setSaving(true);

    /* 1. Upload all media files */
    const allFiles = Object.values(uploads).flat();
    const uploadedMedia = [];

    if (allFiles.length > 0) {
      console.log("BEFORE MEDIA UPLOAD");
      setUploadProgress(`Uploading media (0 / ${allFiles.length})…`);
      for (let i = 0; i < allFiles.length; i++) {
        try {
          setUploadProgress(`Uploading media (${i + 1} / ${allFiles.length})…`);
          const result = await uploadFile(allFiles[i].file);
          uploadedMedia.push(result);
        } catch (err) {
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
    const slug = generateSlug(title);

    // ── Resolve the authenticated user ONCE for the whole save operation ─────
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      setError("You must be logged in to create a capsule.");
      setSaving(false);
      setUploadProgress("");
      return;
    }
    const currentUserId = authData.user.id;
    console.log("🔐 Authenticated user.id for new capsule:", currentUserId);
    // ────────────────────────────────────────────────────────────────────────

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

    // FIX: receiver_email holds a real email address only
    const recipientEmail = manualReceiverIsEmail ? receiverName.trim() : null;
    // ──────────────────────────────────────────────────────────────────────────

    const payload = {
      sender_id:      currentUserId,   // ← belt-and-suspenders for RLS policy
      sender_name:    senderName.trim(),
      receiver_id:    recipientId,     // real TimeLock user UUID, or null
      receiver_name:  recipientName,   // human-readable "To:" — never a UUID
      receiver_email: recipientEmail,  // real email only, or null
      title:          title.trim(),
      message:        message,
      hint:           hint,
      cover_type:     coverType,
      unlock_date:    unlockDateTimeString,
      content_types:  selectedTypes,
      media_urls:     uploadedMedia.map((m) => m.url),
      media_types:    uploadedMedia.map((m) => m.type),
      slug,
    };

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
    const savedSlug = data?.[0]?.slug || slug;
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
      } catch (msgErr) {
        console.error("Error sending capsule message:", msgErr);
      }
    };

    /* 3. Share via WhatsApp */
    if (shareVia === "whatsapp") {
      const waText = `I sent you a Time Capsule! It unlocks on ${unlockDateDisplay}. Open it here: ${capsuleUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank");
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
                    onFocus={() => userSearchResults.length > 0 && setShowUserDropdown(true)}
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

            {/* Dropdown results */}
            {showUserDropdown && !selectedUserId && (userSearchLoading || userSearchResults.length > 0) && (
              <div className="cc-user-dropdown">
                {userSearchLoading ? (
                  <div className="cc-user-dropdown-empty">Searching…</div>
                ) : (
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
                      <span className="cc-user-dropdown-name">{user.display_name}</span>
                    </button>
                  ))
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
            <div className="cc-ig-modal-backdrop" onClick={() => setIgModalVisible(false)}>
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
                  onClick={() => setIgModalVisible(false)}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          <button
            className="cc-ghost-btn"
            onClick={() => setStep(2)}
            disabled={saving}
          >
            Save as Draft
          </button>
        </div>
      )}
    </div>
  );
}

export default CreateCapsule;
