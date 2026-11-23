import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowRight } from 'lucide-react';
import kroomboxMark from './kroombox-mark.svg?inline';
import { Brand } from './components.jsx';
import { preloadSession } from './App.jsx';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Landing({ onEnter }) {
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);

  // Ambil sesi sejak awal, supaya halaman login bisa langsung tampil saat Masuk diklik.
  // Sudah login (misalnya kembali lewat tombol Back): langsung ke dashboard.
  useEffect(() => {
    preloadSession()
      .then(data => { if (data?.user) location.replace(data.user.role === 'admin' ? '/admin' : '/user'); })
      .catch(() => {});
  }, []);

  // Klik dengan Ctrl/tombol tengah tetap dibiarkan normal (buka tab baru).
  async function enter(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const session = preloadSession().catch(() => null);
    if (reducedMotion()) return onEnter();

    // Browser tanpa View Transitions: panel terang menutup sisi kanan, lalu pindah.
    if (!document.startViewTransition) {
      setLeaving(true);
      setTimeout(onEnter, 620);
      return;
    }

    // Logo, brand, dan judul meluncur ke posisinya di halaman login; panel form masuk dari kanan.
    await session;
    document.documentElement.classList.add('from-landing');
    document.startViewTransition(() => flushSync(onEnter));
  }

  return (
    <div className={'landing' + (leaving ? ' leaving' : '')}>
      <header className="landing-top"><Brand light /></header>
      <main className="landing-hero">
        <img className="landing-mark" src={kroomboxMark} alt="Kroombox" />
        <h1><span>Direktori</span><br /><span>aplikasi tim.</span></h1>
        <p>Semua aplikasi tim Kroombox di satu tempat.</p>
        <a className="landing-cta" href="/login" onClick={enter}>Masuk<ArrowRight size={18} /></a>
      </main>
      <img className="landing-art" src={kroomboxMark} alt="" aria-hidden="true" />
      <span className="landing-glow" aria-hidden="true" />
      <span className="landing-wipe" aria-hidden="true" />
    </div>
  );
}
