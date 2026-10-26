import { useState } from 'react'
import type { Project } from '../../lib/project'
import { useStudioMenu } from './useStudioMenu'

export interface SavedStudioProject {
  id: string
  title: string
  project: Project
}

interface StudioTopBarProps {
  project: Project
  canUndo: boolean
  canRedo: boolean
  savedProjects: SavedStudioProject[]
  onUndo: () => void
  onRedo: () => void
  onTitleChange: (title: string) => void
  onGenerate: (vibe: string) => void
  onShare: () => void
  onExport: (format: 'midi' | 'chords-midi' | 'wav') => void
  onSaveAs: () => void
  onOpenProject: (project: Project) => void
  onDeleteProject: (id: string) => void
}

export function StudioTopBar({
  project,
  canUndo,
  canRedo,
  savedProjects,
  onUndo,
  onRedo,
  onTitleChange,
  onGenerate,
  onShare,
  onExport,
  onSaveAs,
  onOpenProject,
  onDeleteProject,
}: StudioTopBarProps) {
  const [vibe, setVibe] = useState('')
  const [titleEditing, setTitleEditing] = useState(false)
  const { openMenu, setOpenMenu } = useStudioMenu()
  const projectsOpen = openMenu === 'project'
  const exportOpen = openMenu === 'export'
  const vibeOpen = openMenu === 'vibe'

  const runGenerate = () => onGenerate(vibe)
  return (
    <header className="studio-topbar">
      <div className="studio-brand">
        <a className="studio-back" href="/" aria-label="Back to tryad">←</a>
        <a className="studio-wordmark" href="/">t<span>ry</span>ad</a>
        <div className="studio-project-select" data-studio-menu-root>
          {titleEditing ? (
            <input
              autoFocus
              aria-label="Project title"
              className="studio-title-input"
              value={project.title}
              onChange={(event) => onTitleChange(event.target.value)}
              onBlur={() => setTitleEditing(false)}
              onKeyDown={(event) => event.key === 'Enter' && setTitleEditing(false)}
            />
          ) : (
            <button type="button" className="studio-title" onClick={() => setOpenMenu(projectsOpen ? null : 'project')}>
              {project.title || 'untitled'} <span>⌄</span>
            </button>
          )}
          {projectsOpen ? (
            <div className="studio-popover studio-projects-menu">
              <div className="studio-popover-title">Projects on this device</div>
              <button type="button" onClick={() => { setTitleEditing(true); setOpenMenu(null) }}>Rename project</button>
              <button type="button" onClick={() => { onSaveAs(); setOpenMenu(null) }}>Save as new project</button>
              {savedProjects.map((item) => (
                <div className="studio-saved-row" key={item.id}>
                  <button type="button" onClick={() => { onOpenProject(item.project); setOpenMenu(null) }}>{item.title}</button>
                  <button type="button" aria-label={`Delete ${item.title}`} onClick={() => onDeleteProject(item.id)}>×</button>
                </div>
              ))}
              {savedProjects.length === 0 ? <span className="studio-muted">No saved projects yet</span> : null}
            </div>
          ) : null}
        </div>
        <div className="studio-history">
          <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>↶</button>
          <button type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>↷</button>
        </div>
      </div>
      <div className={`studio-vibe ${vibeOpen ? 'is-expanded' : ''}`} data-studio-menu-root>
        <input
          aria-label="Vibe prompt"
          placeholder="type a vibe… rainy lofi, epic trailer, sad piano"
          value={vibe}
          onChange={(event) => setVibe(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && runGenerate()}
        />
        <button type="button" className="studio-generate-button" onClick={runGenerate}>Generate</button>
      </div>
      <button type="button" className="studio-vibe-mobile" data-studio-menu-root aria-label="Open vibe generator" onClick={() => setOpenMenu(vibeOpen ? null : 'vibe')}>Generate</button>
      <div className="studio-top-actions">
        <button type="button" className="studio-share" onClick={onShare}>Share</button>
        <div className="studio-export-wrap" data-studio-menu-root>
          <button type="button" className="studio-export-main" onClick={() => onExport('midi')}>Export</button>
          <button type="button" className="studio-export-caret" aria-label="Export options" onClick={() => setOpenMenu(exportOpen ? null : 'export')}>⌄</button>
          {exportOpen ? (
            <div className="studio-popover studio-export-menu">
              <button type="button" onClick={() => { onExport('midi'); setOpenMenu(null) }}>MIDI · all tracks</button>
              <button type="button" onClick={() => { onExport('chords-midi'); setOpenMenu(null) }}>MIDI · chords only</button>
              <button type="button" onClick={() => { onExport('wav'); setOpenMenu(null) }}>WAV · render song</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
