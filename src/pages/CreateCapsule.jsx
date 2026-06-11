import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import BottomNav from "../components/BottomNav";
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

  /* wizard state */
  const [step,    setStep]    = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  /* form fields */
  const [selectedTypes, setSelectedTypes] = useState(["text"]);
  const [message,       setMessage]       = useState("");
  const [senderName,    setSenderName]    = useState("");
  const [email,         setEmail]         = useState("");
  const [title,         setTitle]         = useState("");
  const [unlockDate,    setUnlockDate]    = useState("");
  const [unlockTime,    setUnlockTime]    = useState("");
  const [hint,          setHint]          = useState("");
  const [coverType,     setCoverType]     = useState("love");

  /* media uploads: { photo: [], video: [], audio: [], file: [] } */
  const [uploads, setUploads] = useState({ photo: [], video: [], audio: [], file: [] });

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
    senderName.trim() && email.trim() && title.trim() && unlockDate && unlockTime;

  /* ── submit ── */
  const saveCapsule = async () => {
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
    console.log("BEFORE CAPSULE INSERT");
    console.log("UPLOADED MEDIA", uploadedMedia);

    const slug = generateSlug(title);

    const payload = {
      sender_name:    senderName,
      receiver_email: email,
      title:          title,
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
    console.log("AFTER CAPSULE INSERT");

    setSaving(false);
    setUploadProgress("");

    if (err) { setError(err.message); return; }
    const savedSlug = data?.[0]?.slug || slug;
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

          <p className="cc-section-label">Who is this for?</p>

          <div className="cc-glass-field">
            <input
              className="cc-inline-input"
              type="text"
              placeholder="Your name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>

          <div className="cc-glass-field">
            <span className="cc-glass-avatar">👤</span>
            <div className="cc-glass-right">
              <input
                className="cc-inline-input"
                type="text"
                placeholder="Capsule title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className="cc-inline-input cc-sub-input"
                type="email"
                placeholder="receiver@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="cc-edit-btn" aria-label="Edit">✏️</button>
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
                <p className="cc-preview-field-value">{email || "—"}</p>
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
            onClick={saveCapsule}
            disabled={saving}
          >
            {saving ? uploadProgress || "Sending…" : "Send Capsule 🚀"}
          </button>

          <button
            className="cc-ghost-btn"
            onClick={() => setStep(2)}
            disabled={saving}
          >
            Save as Draft
          </button>
        </div>
      )}

      <div className="cc-bottom-spacer" />
      <BottomNav />
    </div>
  );
}

export default CreateCapsule;
