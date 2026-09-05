import { Routes, Route, Navigate } from 'react-router-dom'
import Shell from './components/Shell'
import GlobeScreen from './routes/GlobeScreen'
import PathScreen from './routes/PathScreen'
import ReferenceScreen from './routes/ReferenceScreen'
import ReviewScreen from './routes/ReviewScreen'
import ProfileScreen from './routes/ProfileScreen'
import SettingsScreen from './routes/SettingsScreen'
import SourcesScreen from './routes/SourcesScreen'
import EntityScreen from './routes/EntityScreen'
import { useAppChrome } from './lib/useAppChrome'

export default function App() {
  useAppChrome()

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<GlobeScreen />} />
        <Route path="/path" element={<PathScreen />} />
        <Route path="/reference" element={<ReferenceScreen />} />
        <Route path="/review" element={<ReviewScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/sources" element={<SourcesScreen />} />
        <Route path="/e/:id" element={<EntityScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
