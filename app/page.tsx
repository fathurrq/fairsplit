import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 md:p-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 text-center">
          FairSplit
        </h1>
        <p className="text-lg text-gray-600 mb-8 text-center">
          Split bills and expenses with friends easily. No signup required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/create"
            className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
          >
            Create New Bill
          </Link>
          <Link
            href="/ocr-test"
            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
          >
            OCR Test
          </Link>
          <Link
            href="/bills"
            className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 px-6 rounded-lg transition-colors text-center"
          >
            View Bills
          </Link>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl mb-2">📸</div>
            <h3 className="font-semibold mb-1">Upload Receipt</h3>
            <p className="text-sm text-gray-600">Scan or upload your receipt</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">👥</div>
            <h3 className="font-semibold mb-1">Share & Claim</h3>
            <p className="text-sm text-gray-600">Friends claim their items</p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-2">💰</div>
            <h3 className="font-semibold mb-1">Split Fairly</h3>
            <p className="text-sm text-gray-600">Automatic cost splitting</p>
          </div>
        </div>
      </div>
    </main>
  )
}

