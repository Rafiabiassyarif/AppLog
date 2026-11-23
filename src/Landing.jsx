import kroomboxMark from './kroombox-mark.svg?inline';
import React from 'react';
import {LockKeyhole} from 'lucide-react';
import {Brand, Button} from './components.jsx';

export default function Landing() {
  return <div className="team-portal">
    <header className="portal-bar"><Brand/><span><LockKeyhole size={14}/> Internal</span></header>
    <main className="portal-main">
      <section className="portal-card" aria-labelledby="portal-title">
        <div className="portal-copy">
          <div className="portal-owner"><img src={kroomboxMark} alt=""/> Kroombox</div>
          <h1 id="portal-title">Direktori<br/>aplikasi tim.</h1>
          <p>Catat aplikasi internal dan proyek personal anggota Kroombox. Masuk untuk melihat daftar aplikasi atau memperbarui proyekmu.</p>
          <Button href="/login">Masuk ke AppLog</Button>
          <small>Butuh akun? Hubungi admin tim.</small>
        </div>
        <div className="portal-art" aria-hidden="true"><img src={kroomboxMark} alt=""/></div>
      </section>
    </main>
    <footer className="portal-foot"><span>Kroombox / AppLog</span><span>Pendataan aplikasi</span></footer>
  </div>;
}
