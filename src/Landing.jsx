import React from 'react';
import { ArrowRight } from 'lucide-react';
import kroomboxMark from './kroombox-mark.svg?inline';
import { Brand } from './components.jsx';

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-top"><Brand light /></header>
      <main className="landing-hero">
        <img className="landing-mark" src={kroomboxMark} alt="Kroombox" />
        <h1>Direktori<br />aplikasi tim.</h1>
        <p>Semua aplikasi tim Kroombox di satu tempat.</p>
        <a className="landing-cta" href="/login">Masuk<ArrowRight size={18} /></a>
      </main>
      <img className="landing-art" src={kroomboxMark} alt="" aria-hidden="true" />
    </div>
  );
}
