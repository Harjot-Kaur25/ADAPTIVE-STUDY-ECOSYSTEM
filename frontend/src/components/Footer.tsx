import { BookOpen } from 'lucide-react'

export default function Footer() {
  return <footer className="workspace-footer"><a href="#home" className="footer-wordmark"><span className="footer-mark"><BookOpen size={14} /></span> StudyEco</a><span>Thoughtful study planning, adapted to you.</span><nav aria-label="Footer links"><a href="#features">Product</a><a href="#focus">Features</a><a href="#dashboard">Privacy</a><a href="mailto:hello@studyeco.example">Contact</a></nav><small>© {new Date().getFullYear()} StudyEco</small></footer>
}