export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-4xl font-bold text-red-500 uppercase tracking-tighter">404</h1>
        <p className="text-zinc-400">Page not found. The requested resource does not exist.</p>
        <a
          href="/"
          className="inline-block mt-4 px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Return Home
        </a>
      </div>
    </div>
  );
}
