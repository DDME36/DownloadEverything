import { useState } from 'react'
import Header from './components/Header'
import SmartInput from './components/SmartInput'
import ResultCard from './components/ResultCard'
import LoadingState from './components/LoadingState'
import ErrorAlert from './components/ErrorAlert'
import { useFetch } from './hooks/useFetch'

export default function App() {
  const { data, loading, error, analyze, reset } = useFetch()
  const [currentUrl, setCurrentUrl] = useState('')

  const handleSubmit = (url) => {
    setCurrentUrl(url)
    analyze(url)
  }

  return (
    <div className="app">
      <Header />
      <SmartInput onSubmit={handleSubmit} loading={loading} onReset={reset} />

      {error && <ErrorAlert error={error} onClose={reset} />}
      {loading && <LoadingState />}
      {data && !loading && <ResultCard data={data} originalUrl={currentUrl} />}

      <footer className="footer">
        <p>Download Everything — สร้างโดย ddme36</p>
      </footer>
    </div>
  )
}
