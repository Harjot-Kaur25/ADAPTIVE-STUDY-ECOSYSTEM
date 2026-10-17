import './App.css'
import AIPersonalization from './components/AIPersonalization'
import CTA from './components/CTA'
import DashboardShowcase from './components/DashboardShowcase'
import FeaturesGrid from './components/FeaturesGrid'
import Footer from './components/Footer'
import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Navbar, { WorkspaceHeader } from './components/Navbar'

function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="workspace">
        <WorkspaceHeader />
        <Hero />
        <AIPersonalization />
        <HowItWorks />
        <FeaturesGrid />
        <DashboardShowcase />
        <CTA />
        <Footer />
      </main>
    </div>
  )
}

export default App
