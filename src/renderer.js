/* ============================================================
   YTX Downloader - Renderer Process
   Steuert die React App und kommuniziert mit Electron Backend
   ============================================================ */

// Backend API Bridge
const getYtxAPI = () => {
  if (!window.ytx) {
    const noopListen = () => () => {};
    window.ytx = {
      getState: async () => ({ defaultDownloadFolder: "Downloads", platform: "browser" }),
      setTheme: async () => ({ ok: true }),
      selectFolder: async () => null,
      startDownload: async () => ({ ok: false, error: "Download ist nur in Electron verfügbar." }),
      cancelDownload: async () => ({ ok: true }),
      openFolder: async () => ({ ok: true }),
      onStarted: noopListen,
      onProgress: noopListen,
      onLog: noopListen,
      onCompleted: noopListen,
      onFailed: noopListen
    };
  }
  return window.ytx;
};

// Vela Design System Komponenten
const { Button, IconButton, Badge, Spinner } = window.VelaDesignSystem_f6c677 || {};
const { Input, Switch, Select } = window.VelaDesignSystem_f6c677 || {};

// Fallback: Wenn Bundle nicht geladen ist
if (!window.VelaDesignSystem_f6c677) {
  console.warn('Vela Design System Bundle nicht geladen');
}

const { useState, useEffect, useCallback, useRef } = React;

// Dateinamen aus einem yt-dlp Logeintrag extrahieren (best effort)
function parseFilenameFromLog(line) {
  let match = line.match(/Merging formats into "(.+?)"/);
  if (!match) match = line.match(/Destination:\s*(.+)$/);
  if (!match) match = line.match(/\[download\]\s+(.+?) has already been downloaded/);
  if (!match) return null;
  const full = match[1].trim();
  const parts = full.split(/[\\/]/);
  return parts[parts.length - 1] || full;
}

// Heuristik: Sieht die URL nach einer Playlist/Sammlung aus? Deckt die gängigen
// Plattformen ab (nicht nur YouTube), ohne yt-dlp zu befragen:
//  - YouTube:    ?list=… / &list=… / &index=… / /playlist
//  - SoundCloud: /sets/
//  - Bandcamp/Spotify/Vimeo: /album/ , /showcase/
//  - generisch:  das Wort "playlist", /series/
// Für 100% Sicherheit müsste man yt-dlp proben – hier bewusst sofort & offline.
function looksLikePlaylist(url) {
  if (!url) return false;
  return /(\bplaylist\b)|([?&](list|playlist)=)|([?&]index=\d)|(\/sets\/)|(\/albums?\/)|(\/showcase\/)|(\/series\/)/i.test(url);
}

// SVG Icons
function IconDownload() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
}

function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
}

function IconRetry() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>;
}

function IconPlay() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>;
}

function IconFolder() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
}

function IconVideo() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>;
}

function IconAudio() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
}

function IconClose() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>;
}

function IconMinimize() {
  return <svg width="10" height="1" viewBox="0 0 10 1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="0" y1=".5" x2="10" y2=".5"/></svg>;
}

function IconMaximize() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x=".5" y=".5" width="9" height="9" fill="none"/></svg>;
}

function IconWarn() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>;
}

function IconGear() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

// Vela App Hauptkomponente
function VelaApp() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('video');
  const [quality, setQuality] = useState('1080p');
  const [playlistMode, setPlaylistMode] = useState('single');
  const [downloads, setDownloads] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [folder, setFolder] = useState('');
  const [autoStart, setAutoStart] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [openAfter, setOpenAfter] = useState(false);
  const [encoding, setEncoding] = useState('utf-8');
  const [cookiesBrowser, setCookiesBrowser] = useState('none');
  const [playwrightFallback, setPlaywrightFallback] = useState(false);
  const [theme, setTheme] = useState('dark');
  // Backend-Abhängigkeiten (Default true, damit vor der Prüfung keine Warnung blitzt)
  const [deps, setDeps] = useState({ ytDlpAvailable: true, ffmpegAvailable: true });

  const ytx = getYtxAPI();

  // Id des aktuell laufenden Downloads (für Backend-Events)
  const activeIdRef = useRef(null);
  // Aktuellen Ordner für Event-Handler verfügbar halten
  const folderRef = useRef(folder);
  useEffect(() => { folderRef.current = folder; }, [folder]);
  // Benachrichtigungs-Einstellung + Download-Liste für Event-Handler spiegeln
  const notificationsRef = useRef(notifications);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  const openAfterRef = useRef(openAfter);
  useEffect(() => { openAfterRef.current = openAfter; }, [openAfter]);
  const downloadsRef = useRef(downloads);
  useEffect(() => { downloadsRef.current = downloads; }, [downloads]);

  // Initialisierung
  useEffect(() => {
    const init = async () => {
      const savedTheme = localStorage.getItem('ytx-theme') || 'dark';
      setTheme(savedTheme);
      document.body.dataset.theme = savedTheme;

      const savedAuto = localStorage.getItem('ytx-auto-start');
      if (savedAuto !== null) setAutoStart(savedAuto === 'true');
      const savedNotif = localStorage.getItem('ytx-notifications');
      if (savedNotif !== null) setNotifications(savedNotif === 'true');
      const savedOpenAfter = localStorage.getItem('ytx-open-after');
      if (savedOpenAfter !== null) setOpenAfter(savedOpenAfter === 'true');
      const savedEncoding = localStorage.getItem('ytx-encoding');
      if (savedEncoding) setEncoding(savedEncoding);
      const savedCookies = localStorage.getItem('ytx-cookies-browser');
      if (savedCookies) setCookiesBrowser(savedCookies);
      const savedPw = localStorage.getItem('ytx-playwright-fallback');
      if (savedPw !== null) setPlaywrightFallback(savedPw === 'true');

      try {
        const state = await ytx.getState();
        const savedFolder = localStorage.getItem('ytx-output-folder');
        if (savedFolder) {
          setFolder(savedFolder);
        } else {
          setFolder(state.defaultDownloadFolder || 'Downloads');
        }
        setDeps({
          ytDlpAvailable: state.ytDlpAvailable !== false,
          ffmpegAvailable: state.ffmpegAvailable !== false
        });
      } catch (e) {
        console.error('Initialisierung fehlgeschlagen:', e);
      }
    };
    init();
  }, []);

  // Theme anwenden
  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('ytx-theme', theme);
    ytx.setTheme(theme);
  }, [theme, ytx]);

  // Verhalten-Einstellungen persistieren
  useEffect(() => { localStorage.setItem('ytx-auto-start', String(autoStart)); }, [autoStart]);
  useEffect(() => { localStorage.setItem('ytx-notifications', String(notifications)); }, [notifications]);
  useEffect(() => { localStorage.setItem('ytx-open-after', String(openAfter)); }, [openAfter]);
  useEffect(() => { localStorage.setItem('ytx-encoding', encoding); }, [encoding]);
  useEffect(() => { localStorage.setItem('ytx-cookies-browser', cookiesBrowser); }, [cookiesBrowser]);
  useEffect(() => { localStorage.setItem('ytx-playwright-fallback', String(playwrightFallback)); }, [playwrightFallback]);

  // Backend Events: Fortschritt, Logs, Abschluss, Fehler
  useEffect(() => {
    const updateActive = (patch) => {
      setDownloads(prev => prev.map(d =>
        d.id === activeIdRef.current ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d
      ));
    };

    const unsubscribeProgress = ytx.onProgress((progress) => {
      if (progress.percent === undefined) return;
      updateActive({
        progress: progress.percent,
        speed: progress.speed || undefined,
        eta: progress.eta || undefined,
        filesize: progress.total || undefined
      });
    });

    const unsubscribeLog = ytx.onLog((line) => {
      console.log('[Backend]', line);
      const name = parseFilenameFromLog(line);
      if (name) updateActive({ filename: name });
    });

    const unsubscribeCompleted = ytx.onCompleted(() => {
      const id = activeIdRef.current;
      activeIdRef.current = null;
      const item = downloadsRef.current.find(d => d.id === id);
      if (notificationsRef.current && item && typeof Notification !== 'undefined') {
        try {
          new Notification('Download abgeschlossen', { body: item.filename || item.url });
        } catch (e) { /* Notification nicht verfügbar */ }
      }
      if (openAfterRef.current) {
        ytx.openFolder(folderRef.current);
      }
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'done', progress: 100, speed: undefined, eta: undefined } : d));
    });

    const unsubscribeFailed = ytx.onFailed((message) => {
      console.error('Download fehlgeschlagen:', message);
      const id = activeIdRef.current;
      activeIdRef.current = null;
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error', speed: undefined, eta: undefined, error: message } : d));
    });

    return () => {
      unsubscribeProgress();
      unsubscribeLog();
      unsubscribeCompleted();
      unsubscribeFailed();
    };
  }, [ytx]);

  // Einen Eintrag im Backend starten
  const startItem = useCallback((item) => {
    activeIdRef.current = item.id;
    setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'downloading', progress: 0 } : d));

    const options = {
      url: item.url,
      format: item.format === 'audio' ? 'mp3' : 'mp4',
      quality: item.format === 'video' ? String(item.quality).replace(/p$/i, '') : undefined,
      audioQuality: item.format === 'audio' ? String(item.quality).toUpperCase() : undefined,
      playlistMode: item.playlistMode === 'single' ? 'single-video'
        : item.playlistMode === 'combined' ? 'playlist-combined'
        : 'playlist-items',
      outputFolder: folderRef.current,
      encoding: item.encoding || 'utf-8',
      cookiesBrowser: item.cookiesBrowser || 'none',
      playwrightFallback: !!item.playwrightFallback
    };

    ytx.startDownload(options).then(result => {
      if (!result.ok) {
        setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'error', error: result.error } : d));
        if (activeIdRef.current === item.id) activeIdRef.current = null;
      }
    }).catch(err => {
      console.error('Backend Exception:', err);
      setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'error', error: String(err) } : d));
      if (activeIdRef.current === item.id) activeIdRef.current = null;
    });
  }, [ytx]);

  // Warteschlange sequentiell abarbeiten: ein Download gleichzeitig
  useEffect(() => {
    if (activeIdRef.current !== null) return;
    if (downloads.some(d => d.status === 'downloading')) return;
    const next = downloads.filter(d => d.status === 'queued').sort((a, b) => a.id - b.id)[0];
    if (next) startItem(next);
  }, [downloads, startItem]);

  // Download zur Warteschlange hinzufügen
  const addDownload = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const id = Date.now();
    const newDownload = {
      id,
      url: trimmed,
      filename: trimmed,
      format,
      quality,
      playlistMode,
      encoding,
      cookiesBrowser,
      playwrightFallback,
      status: autoStart ? 'queued' : 'paused',
      progress: 0,
      filesize: undefined,
      speed: undefined,
      eta: undefined
    };

    setDownloads(prev => [newDownload, ...prev]);
    setUrl('');
  }, [url, format, quality, playlistMode, encoding, cookiesBrowser, playwrightFallback, autoStart]);

  // Download entfernen (aktiven Download zuvor abbrechen)
  const removeDownload = (id) => {
    if (activeIdRef.current === id) {
      ytx.cancelDownload();
      activeIdRef.current = null;
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  // Eintrag (erneut) in die Warteschlange stellen
  const queueDownload = (id) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'queued', progress: 0, error: undefined } : d));
  };

  // Ordner öffnen
  const openFolder = () => {
    ytx.openFolder(folder);
  };

  // Ordner wählen
  const chooseFolder = async () => {
    const selected = await ytx.selectFolder();
    if (selected) {
      setFolder(selected);
      localStorage.setItem('ytx-output-folder', selected);
    }
  };

  // Alle abgeschlossenen/fehlerhaften entfernen, aktive behalten
  const clearFinished = () => {
    setDownloads(prev => prev.filter(d => d.status === 'downloading' || d.status === 'queued'));
  };

  // Anzahl aktive Downloads
  const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'queued').length;
  const completedCount = downloads.filter(d => d.status === 'done').length;

  // Format-Optionen
  const qualityOptions = format === 'video'
    ? [{ value: '480p', label: '480p SD' }, { value: '720p', label: '720p HD' }, { value: '1080p', label: '1080p FHD' }, { value: '2160p', label: '4K UHD' }]
    : [{ value: '128k', label: '128 kbps' }, { value: '192k', label: '192 kbps' }, { value: '256k', label: '256 kbps' }, { value: '320k', label: '320 kbps (best)' }];

  // Download Row Komponente
  function DownloadItem({ download }) {
    const pct = Math.min(100, Math.max(0, download.progress));
    const label = download.status === 'queued' ? 'In Warteschlange' :
                    download.status === 'paused' ? 'Angehalten' :
                    download.status === 'downloading' ? (download.speed ? `${Math.round(pct)}% · ${download.speed}` : `${Math.round(pct)}%`) :
                    download.status === 'done' ? 'Fertig' :
                    download.status === 'error' ? 'Fehlgeschlagen' : download.status;

    const fillClass = download.status === 'done' ? 'fd' :
                      download.status === 'error' ? 'fe' :
                      download.status === 'queued' || download.status === 'paused' ? 'fq' :
                      download.format === 'audio' ? 'fa' : 'fv';

    return (
      <div className="vdlr">
        <div className={`vdlr-ico ${download.format === 'audio' ? 'vdli-audio' : 'vdli-video'}`}>
          {download.format === 'audio' ? <IconAudio /> : <IconVideo />}
        </div>
        <div className="vdlr-body">
          <div className="vdlr-name" title={download.error || download.filename}>{download.filename}</div>
          <div className="vdlr-meta">
            {download.filesize && <span className="vdlr-size">{download.filesize}</span>}
            <span className={`vdlr-st st-${download.status}`}>{label}</span>
          </div>
          <div className="vdlr-track">
            <div className={`vdlr-fill ${fillClass}`} style={(download.status === 'queued' || download.status === 'paused') ? { width: '100%' } : { width: (download.status === 'done' ? 100 : pct) + '%' }} />
          </div>
          {download.status === 'error' && download.error && (
            <div className="vdlr-err" title={download.error}>{download.error}</div>
          )}
        </div>
        <div className="vdlr-btns">
          {download.status === 'error' && <IconButton aria-label="Wiederholen" onClick={() => queueDownload(download.id)}><IconRetry /></IconButton>}
          {download.status === 'paused' && <IconButton aria-label="Starten" onClick={() => queueDownload(download.id)}><IconPlay /></IconButton>}
          {download.status === 'done' && <IconButton aria-label="Ordner öffnen" onClick={openFolder}><IconFolder /></IconButton>}
          <IconButton aria-label="Entfernen" onClick={() => removeDownload(download.id)}><IconTrash /></IconButton>
        </div>
      </div>
    );
  }

  // Eingabekarte
  const InputCard = () => (
    <div className="input-card">
      {UrlBar({ value: url, onChange: setUrl, onPaste: (text) => setUrl(text) })}
      <div className="opts-row">
        {FormatToggle({ value: format, onChange: (v) => { setFormat(v); setQuality(v === 'video' ? '1080p' : '256k'); } })}
        <div style={{ width: 155 }}>
          <Select value={quality} onChange={setQuality} options={qualityOptions} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="settings-btn" onClick={() => setShowSettings(true)} aria-label="Einstellungen" title="Einstellungen">
          <IconGear />
        </button>
        <Button variant={url.trim() ? 'primary' : 'neutral'} disabled={!url.trim()} onClick={addDownload}>
          <IconDownload /> {autoStart ? 'Herunterladen' : 'Zur Warteschlange'}
        </Button>
      </div>
      {looksLikePlaylist(url) && <div className="pl-anim">{PlaylistMode({ mode: playlistMode, onChange: setPlaylistMode })}</div>}
    </div>
  );

  // Download Tab
  const DownloadsTab = () => (
    <>
      <div className="dl-top-spacer" />
      {InputCard()}
      {(!deps.ytDlpAvailable || !deps.ffmpegAvailable) && (
        <div className="dep-warning">
          <IconWarn />
          <span>
            {!deps.ytDlpAvailable
              ? 'yt-dlp wurde nicht gefunden. Ohne yt-dlp im PATH sind keine Downloads möglich – bitte installieren (z. B. "pip install yt-dlp") und neu starten.'
              : 'ffmpeg wurde nicht gefunden. Für das Zusammenführen von MP4 und die MP3-Konvertierung wird ffmpeg benötigt – bitte installieren und neu starten.'}
          </span>
        </div>
      )}
      <div className="dl-section">
        <div className="dl-header">
          <span className="dl-htitle">Warteschlange</span>
          {activeCount > 0 && <Badge variant="primary">{activeCount} aktiv</Badge>}
          <div style={{ flex: 1 }} />
          {downloads.length > 0 && <button className="dl-clear" onClick={clearFinished}>Abgeschlossene entfernen</button>}
        </div>
        {downloads.length === 0
          ? <div className="empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3" /></svg><p>Noch keine Downloads. Füge oben eine Video- oder Playlist-URL ein – YouTube, Vimeo, TikTok, SoundCloud und viele weitere Plattformen werden unterstützt.</p></div>
          : <div className="dl-list">{downloads.map(d => <React.Fragment key={d.id}>{DownloadItem({ download: d })}</React.Fragment>)}</div>
        }
      </div>
    </>
  );

  // Einstellungen
  const SettingsTab = () => (
    <div className="settings">
      <div className="settings-section">
        <span className="settings-lbl">Download-Ort</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={folder} onChange={setFolder} style={{ flex: 1, minWidth: '200px' }} />
          <Button variant="neutral" onClick={chooseFolder}>Durchsuchen</Button>
        </div>
        <div style={{ color: 'var(--vela-text-3)', fontSize: '12px', marginTop: '4px', wordBreak: 'break-all' }}>
          {folder}
        </div>
      </div>
      <div className="settings-section">
        <span className="settings-lbl">Verhalten</span>
        <Switch checked={autoStart} onChange={setAutoStart} label="Download direkt nach Hinzufügen starten" />
        <Switch checked={notifications} onChange={setNotifications} label="Benachrichtigung bei Fertigstellung" />
        <Switch checked={openAfter} onChange={setOpenAfter} label="Ordner nach Abschluss automatisch öffnen" />
        <Switch checked={playwrightFallback} onChange={setPlaywrightFallback} label="Experimenteller Browser-Fallback (Playwright)" />
        <div style={{ color: 'var(--vela-text-3)', fontSize: '12px', marginTop: '2px', paddingLeft: '44px' }}>
          Letzter Versuch für JS-gerenderte Seiten ohne yt-dlp-Extractor. Startet headless Chromium, lauscht auf Video-Streams und übergibt gefundene URLs an yt-dlp. Langsamer und erfordert: <code style={{ fontFamily: 'monospace' }}>npm install playwright &amp;&amp; npx playwright install chromium</code>
        </div>
      </div>
      <div className="settings-section">
        <span className="settings-lbl">Dateinamen-Kodierung</span>
        <div style={{ maxWidth: '300px' }}>
          <Select value={encoding} onChange={setEncoding} options={[
            { value: 'utf-8', label: 'UTF-8 (empfohlen)' },
            { value: 'utf-8-sig', label: 'UTF-8 mit BOM' },
            { value: 'utf-16', label: 'UTF-16' },
            { value: 'ascii', label: 'ASCII' },
            { value: 'cp1252', label: 'ANSI / Windows-1252 (USA, Westeuropa)' },
            { value: 'latin-1', label: 'ISO-8859-1 (Latin-1)' },
            { value: 'iso-8859-15', label: 'ISO-8859-15 (Latin-9, mit €)' },
            { value: 'cp437', label: 'CP437 (DOS USA)' },
            { value: 'cp850', label: 'CP850 (DOS Westeuropa)' },
            { value: 'mac-roman', label: 'Mac Roman' },
            { value: 'system', label: 'System-Standard' }
          ]} />
        </div>
        <div style={{ color: 'var(--vela-text-3)', fontSize: '12px', marginTop: '2px' }}>
          UTF-8 sorgt dafür, dass Umlaute (ü, ä, ö …) und Sonderzeichen im Dateinamen korrekt erscheinen statt als „?". Die übrigen sind klassische Codepages für ältere Systeme; im Zweifel UTF-8 lassen.
        </div>
      </div>
      <div className="settings-section">
        <span className="settings-lbl">Browser-Cookies (für Login / Altersschranken)</span>
        <div style={{ maxWidth: '300px' }}>
          <Select value={cookiesBrowser} onChange={setCookiesBrowser} options={[
            { value: 'none', label: 'Keine' },
            { value: 'chrome', label: 'Chrome' },
            { value: 'firefox', label: 'Firefox' },
            { value: 'edge', label: 'Edge' },
            { value: 'brave', label: 'Brave' },
            { value: 'opera', label: 'Opera' },
            { value: 'vivaldi', label: 'Vivaldi' },
            { value: 'chromium', label: 'Chromium' },
            { value: 'whale', label: 'Whale' }
          ]} />
        </div>
        <div style={{ color: 'var(--vela-text-3)', fontSize: '12px', marginTop: '2px' }}>
          Übernimmt die Cookies des gewählten Browsers – nötig für Seiten, die Login oder eine Altersbestätigung verlangen. Bei „Keine" werden keine Cookies verwendet. (Der Browser muss installiert und sollte geschlossen sein.)
        </div>
      </div>
    </div>
  );

  // Format Toggle (Video / Audio)
  function FormatToggle({ value, onChange }) {
    const isSelected = (mode) => value === mode;
    return (
      <div className="vft" role="group">
        <button className={`vft-btn vid${isSelected('video') ? ' on' : ''}`} onClick={() => onChange('video')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
          Video <span className="vft-tag">MP4</span>
        </button>
        <button className={`vft-btn aud${isSelected('audio') ? ' on' : ''}`} onClick={() => onChange('audio')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          Audio <span className="vft-tag">MP3</span>
        </button>
      </div>
    );
  }

  // Playlist Mode
  function PlaylistMode({ mode, onChange }) {
    const opts = [
      { v: 'single', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>, name: 'Nur dieses Video', desc: 'Playlist ignorieren' },
      { v: 'split', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>, name: 'Getrennte Videos', desc: 'Jeder Titel als eigene Datei' },
      { v: 'combined', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v18"/><path d="M17 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>, name: 'Ein langes Video', desc: 'Ganze Playlist zu einer Datei' },
    ];
    return (
      <div className="vpm">
        <span className="vpm-lbl">Playlist Modus</span>
        <div className="vpm-opts">
          {opts.map(o => (
            <div key={o.v} className={`vpm-opt${mode === o.v ? ' vpm-active' : ''}`} onClick={() => onChange(o.v)} role="radio" aria-checked={mode === o.v}>
              <div className="vpm-ico">{o.icon}</div>
              <div><div className="vpm-name">{o.name}</div><div className="vpm-desc">{o.desc}</div></div>
              <div className="vpm-dot"><div className="vpm-dot-in"/></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // UrlBar
  function UrlBar({ value, onChange, onPaste }) {
    const filled = value && value.length > 0;
    const handlePaste = async () => {
      try {
        const text = await navigator.clipboard.readText();
        onChange && onChange(text);
        onPaste && onPaste(text);
      } catch {
        onPaste && onPaste('');
      }
    };
    return (
      <div className={`vurl${filled ? ' filled' : ''}`}>
        <input className="vurl-inp" value={value} onChange={e => onChange && onChange(e.target.value)} placeholder="Video- oder Playlist-URL einfügen..." spellCheck={false} autoComplete="off"/>
        {filled && <button className="vurl-clr" onClick={() => onChange && onChange('')} aria-label="Clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
        <button className="vurl-paste" onClick={handlePaste}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>Paste</button>
      </div>
    );
  }

  // Titlebar
  const TitleBar = () => (
    <div className="titlebar">
      <div className="tb-brand">
        <svg width="22" height="22" viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"><ellipse cx="64" cy="64" rx="60" ry="21"/><ellipse cx="64" cy="64" rx="60" ry="21" transform="rotate(60 64 64)"/><ellipse cx="64" cy="64" rx="60" ry="21" transform="rotate(120 64 64)"/><circle cx="64" cy="64" r="9" fill="currentColor" stroke="none"/></svg>
        <span className="tb-name">YTX Downloader</span>
      </div>
      <div className="tb-space" />
      <div className="tb-wc">
        <button className="tc" title="Minimieren" onClick={() => window.electron.minimize()}><IconMinimize /></button>
        <button className="tc" title="Maximieren" onClick={() => window.electron.maximize()}><IconMaximize /></button>
        <button className="tc tc-x" title="Schließen" onClick={() => window.electron.close()}><IconClose /></button>
      </div>
    </div>
  );

  // Statusleiste
  const StatusBar = () => (
    <div className="sbar">
      {activeCount > 0
        ? <span className="sb-txt"><Spinner size="xs" color="primary" />{activeCount} Download{activeCount > 1 ? 's' : ''} aktiv</span>
        : <span className="sb-txt">Bereit</span>}
      <span className="sb-txt">· {completedCount} abgeschlossen</span>
    </div>
  );

  // Haupt-Render
  return (
    <div className="app">
      {TitleBar()}
      <div className="content">
        {DownloadsTab()}
      </div>
      {StatusBar()}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-overlay-content" onClick={e => e.stopPropagation()}>
            <IconButton aria-label="Schließen" className="settings-close" onClick={() => setShowSettings(false)}>
              <IconClose />
            </IconButton>
            {SettingsTab()}
          </div>
        </div>
      )}
    </div>
  );
}

// React Root
ReactDOM.createRoot(document.getElementById('root')).render(<VelaApp />);

// Electron API für Fenstersteuerung
if (typeof window.electron === 'undefined') {
  window.electron = {
    minimize: () => window.ipcRenderer && window.ipcRenderer.send('window:minimize'),
    maximize: () => window.ipcRenderer && window.ipcRenderer.send('window:maximize'),
    close: () => window.ipcRenderer && window.ipcRenderer.send('window:close')
  };
}
