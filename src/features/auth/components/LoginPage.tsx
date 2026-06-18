import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { Activity, Eye, EyeOff, Loader2 } from 'lucide-react'

const DEMO_ACCOUNTS = [
  // {
  //   role: 'Radiologist',
  //   name: 'Dr. Patricia Osei',
  //   email: 'patricia@radiography.co.ke',
  //   desc: 'Full access — read images, write reports',
  //   color: '#16a34a',
  //   border: '#bbf7d0',
  //   bg: '#f0fdf4',
  // },
  {
    role: 'Radiographer',
    name: 'Rose Gathoni',
    email: 'rose@radiography.co.ke',
    desc: 'Manage incoming studies from imaging machines',
    color: '#1A73E8',
    border: '#bfdbfe',
    bg: '#eff6ff',
  },
  // {
  //   role: 'Referring Doctor',
  //   name: 'Dr. David Mwangi',
  //   email: 'david@radiography.co.ke',
  //   desc: 'View your patients results and reports',
  //   color: '#7c3aed',
  //   border: '#ddd6fe',
  //   bg: '#faf5ff',
  // },
  // {
  //   role: 'Admin',
  //   name: 'System Admin',
  //   email: 'admin@radiography.co.ke',
  //   desc: 'Full system access and configuration',
  //   color: '#0891b2',
  //   border: '#a5f3fc',
  //   bg: '#ecfeff',
  // },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('patricia@radiography.co.ke')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 700))
    const ok = login(email, password)
    setLoading(false)
    if (!ok) {
      setError('Invalid credentials. Password is demo1234')
      return
    }
    navigate('/studies')
  }

  const fillDemo = (acc: (typeof DEMO_ACCOUNTS)[0]) => {
    setEmail(acc.email)
    setPassword('demo1234')
    setError('')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: '#1A73E8',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '24px',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: '#0B4F8A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}>
            <Activity size={28} color="white" />
          </div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#ffffff',
            margin: 0,
          }}>
            Radiography
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#bfdbfe',
            margin: '4px 0 0 0',
          }}>
            Teleradiology Platform
          </p>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
          padding: '32px',
        }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '6px',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  color: '#111827',
                  background: '#f9fafb',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '6px',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  style={{
                    width: '100%',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '12px 44px 12px 16px',
                    fontSize: '14px',
                    color: '#111827',
                    background: '#f9fafb',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: 0,
                    display: 'flex',
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '13px',
                color: '#dc2626',
                marginBottom: '16px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '12px',
                background: '#1A73E8',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 600,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '24px',
              }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Signing in...</>
                : 'Sign In'
              }
            </button>
          </form>

          <div>
            <p style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#9ca3af',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '12px',
            }}>
              Demo accounts — click to auto-fill
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}>
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => fillDemo(acc)}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: '12px',
                    border: `2px solid ${acc.border}`,
                    background: acc.bg,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: acc.color,
                    marginBottom: '2px',
                  }}>
                    {acc.role}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '2px',
                  }}>
                    {acc.name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    lineHeight: 1.4,
                  }}>
                    {acc.desc}
                  </div>
                </button>
              ))}
            </div>

            <p style={{
              textAlign: 'center',
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '16px',
              marginBottom: 0,
            }}>
              Password for all demos:{' '}
              <span style={{
                fontFamily: 'monospace',
                fontWeight: 600,
                color: '#374151',
              }}>
                demo1234
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}