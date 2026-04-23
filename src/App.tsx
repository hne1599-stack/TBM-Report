import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { Printer, Download, Lightbulb, CloudLightning, BookOpen, CheckCircle, AlertCircle, PenTool, X, Search, RefreshCw, Check, Settings, Database } from 'lucide-react';
import { mockSites, mockRisksDB, SiteInfo, RiskFactor, syncGoogleSheetData } from './data';
import { generateSafetyAdvice } from './aiService';
import { NewTaskModal } from './NewTaskModal';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.6)] flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 flex items-center">
            <PenTool className="w-5 h-5 mr-2 text-blue-600" />
            근로자 서명
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        
        <div className="p-4 bg-gray-100">
          <canvas
            ref={canvasRef}
            className="w-full h-48 bg-white border border-gray-300 rounded-lg touch-none cursor-crosshair shadow-inner"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseOut={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          <p className="text-center text-xs text-gray-500 mt-2">위 박스 안에 서명해주세요.</p>
        </div>
        
        <div className="p-4 border-t flex justify-between gap-3 bg-gray-50">
          <button 
            onClick={clearCanvas}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition flex-1"
          >
            지우기
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex-1"
          >
            서명 완료
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  
  interface HistoryRecord {
    id: string;
    siteName: string;
    taskDate: string;
    tasks: string;
    supervisor: string;
    workerCount: number | string;
    workerOpinion: string;
    aiWeather: string;
    aiAccident: string;
    aiTrend: string;
    aiRules: string;
    generatedAt: string;
  }
  
  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('tbmHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sitesDB, setSitesDB] = useState<SiteInfo[]>(mockSites);
  const [currentRisksDB, setCurrentRisksDB] = useState<Record<string, Record<string, RiskFactor[]>>>(mockRisksDB);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const getLocalDateString = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  const [taskDate, setTaskDate] = useState<string>(getLocalDateString());
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [customRisksLocal, setCustomRisksLocal] = useState<Record<string, RiskFactor[]>>({});
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [supervisor, setSupervisor] = useState('');
  const [workerCount, setWorkerCount] = useState<number | ''>(1);
  const [workerOpinion, setWorkerOpinion] = useState('');
  
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [aiAdvice, setAiAdvice] = useState<{
    weatherAdvice: string;
    accidentCase: string;
    recentTrend: string;
    safetyRules: string[];
    checklist?: string[];
  } | null>(null);
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  
  interface WorkerSignature { id: number; name: string; signature: string | null; }
  const [signatures, setSignatures] = useState<WorkerSignature[]>([{ id: 0, name: '', signature: null }]);
  const [activeSignatureId, setActiveSignatureId] = useState<number | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const count = typeof workerCount === 'number' ? workerCount : 1;
    setSignatures(prev => {
      if (prev.length === count) return prev;
      if (prev.length < count) {
        const newSigs = Array.from({ length: count - prev.length }, (_, i) => ({ id: prev.length + i, name: '', signature: null }));
        return [...prev, ...newSigs];
      }
      return prev.slice(0, count);
    });
  }, [workerCount]);

  useEffect(() => {
    const sheetUrl = import.meta.env.VITE_GOOGLE_SHEET_URL;
    if (sheetUrl) {
      setIsSyncing(true);
      syncGoogleSheetData(sheetUrl)
        .then(data => {
          setSitesDB(data.sites);
          setCurrentRisksDB(data.risksDB);
          setSyncMsg('구글 시트 연동 완료');
        })
        .catch(err => {
          console.error('DB Sync Error:', err);
          setErrorMsg('구글 시트 연동 실패: ' + (err.message || '권한을 확인해주세요.'));
        })
        .finally(() => {
          setIsSyncing(false);
        });
    }
  }, []);

  const currentSite = sitesDB.find(s => s.siteId === selectedSiteId);
  const availableTasks = selectedSiteId ? Object.keys(currentRisksDB[selectedSiteId] || {}) : [];
  const filteredTasks = searchTerm 
    ? availableTasks.filter(t => t.includes(searchTerm)) 
    : availableTasks;
  const currentRisks = (selectedSiteId && selectedTasks.length > 0) 
    ? selectedTasks.flatMap(task => customRisksLocal[task] || currentRisksDB[selectedSiteId]?.[task] || [])
    : [];

  const handleGenerateAdvice = async () => {
    if (!currentSite || selectedTasks.length === 0) {
      setErrorMsg('사업장과 작업명을 최소 1개 이상 선택해주세요.');
      return;
    }
    
    setIsGeneratingAdvice(true);
    setErrorMsg('');
    try {
      const controlMeasures = currentRisks.map(r => r.controlMeasure);
      const advice = await generateSafetyAdvice(currentSite.address, taskDate, selectedTasks, workerOpinion, controlMeasures);
      setAiAdvice(advice);
    } catch (err) {
      setErrorMsg('AI 어드바이스 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGeneratingAdvice(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    
    setIsGeneratingPDF(true);
    setErrorMsg('');
    
    document.body.classList.add('pdf-exporting');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 이력관리에 자동 저장
      const newRecord: HistoryRecord = {
        id: Date.now().toString(),
        siteName: currentSite?.siteName || '-',
        taskDate,
        tasks: selectedTasks.join(', ') || '-',
        supervisor: supervisor || '-',
        workerCount: workerCount || '-',
        workerOpinion: workerOpinion || '-',
        aiWeather: aiAdvice?.weatherAdvice || '-',
        aiAccident: aiAdvice?.accidentCase || '-',
        aiTrend: aiAdvice?.recentTrend || '-',
        aiRules: aiAdvice?.safetyRules ? aiAdvice.safetyRules.join(' / ') : '-',
        generatedAt: new Date().toLocaleString()
      };
      
      const newHistory = [newRecord, ...history];
      setHistory(newHistory);
      localStorage.setItem('tbmHistory', JSON.stringify(newHistory));

      // [추가] 구글 앱스 스크립트 웹훅으로 외부 구글 시트에 전송
      const webhookUrl = import.meta.env.VITE_HISTORY_WEBHOOK_URL;
      if (webhookUrl) {
        const payload = {
          ...newRecord,
          risks: currentRisks
        };
        fetch(webhookUrl, {
          method: 'POST',
          mode: 'no-cors', // CORS 제한 우회
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload)
        }).catch(err => console.error('구글 시트 저장 실패:', err));
      }
      
      const element = reportRef.current;
      
      const opt = {
        margin: [15, 10, 15, 10] as [number, number, number, number], // Top margin set to 1.5cm (15mm)
        filename: `${selectedTasks.length > 0 ? selectedTasks[0].replace(/\\s+/g, '_') : '안전'}_보고서.pdf`,
        image: { type: 'jpeg' as const, quality: 1 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          width: 800,
          windowWidth: 800
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4',
          orientation: 'portrait' as const
        },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.pdf-no-break', 'tr', 'li'] }
      };

      const pdf = html2pdf().set(opt).from(element);
      await pdf.save();
      
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setErrorMsg('PDF 다운로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      document.body.classList.remove('pdf-exporting');
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-slate-50 print:p-0 print:bg-white app-wrapper">
      
      {errorMsg && (
        <div className="max-w-4xl mx-auto mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md no-print shadow-sm">
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      <div className="max-w-4xl mx-auto mb-6 flex gap-2 no-print">
        <button 
          onClick={() => setActiveTab('create')}
          className={`px-6 py-2 rounded-t-lg font-bold transition border-b-0 border ${activeTab === 'create' ? 'bg-white text-blue-600 border-blue-500 border-b-2' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
        >
          평가서 작성
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2 rounded-t-lg font-bold transition border-b-0 border ${activeTab === 'history' ? 'bg-white text-blue-600 border-blue-500 border-b-2' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
        >
          이력관리
        </button>
      </div>

      {activeTab === 'history' && (
        <div className="max-w-[1200px] mx-auto bg-white p-6 rounded-lg shadow-sm border border-gray-200 no-print overflow-x-auto">
          <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2 flex justify-between items-center">
            스마트 TBM 이력 관리
            <button 
              onClick={() => {
                if (confirm('이력을 초기화 하시겠습니까?')) {
                  setHistory([]);
                  localStorage.removeItem('tbmHistory');
                }
              }}
              className="text-sm px-3 py-1 bg-red-50 text-red-500 hover:bg-red-100 rounded border border-red-200 transition"
            >
              전체 기록 초기화
            </button>
          </h2>
          
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 p-2 text-center break-keep w-24">사업장</th>
                <th className="border border-gray-300 p-2 text-center w-24">작업 일자</th>
                <th className="border border-gray-300 p-2 text-center min-w-[150px]">세부 작업</th>
                <th className="border border-gray-300 p-2 text-center w-24">관리감독자</th>
                <th className="border border-gray-300 p-2 text-center w-20">인원</th>
                <th className="border border-gray-300 p-2 text-center min-w-[200px]">스마트 안전 분석 결과 요약</th>
                <th className="border border-gray-300 p-2 text-center w-40 text-blue-700 bg-blue-50">생성 시간</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? history.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 transition">
                  <td className="border border-gray-300 p-2 text-center font-medium text-gray-700">{record.siteName}</td>
                  <td className="border border-gray-300 p-2 text-center">{record.taskDate}</td>
                  <td className="border border-gray-300 p-2 break-keep">{record.tasks}</td>
                  <td className="border border-gray-300 p-2 text-center">{record.supervisor}</td>
                  <td className="border border-gray-300 p-2 text-center">{record.workerCount}</td>
                  <td className="border border-gray-300 p-2 text-xs text-gray-600">
                    <p className="line-clamp-1 mb-1"><strong>☁️ 날씨:</strong> {record.aiWeather}</p>
                    <p className="line-clamp-1 mb-1"><strong>🚨 사고:</strong> {record.aiAccident}</p>
                    <p className="line-clamp-1"><strong>✅ 수칙:</strong> {record.aiRules}</p>
                  </td>
                  <td className="border border-gray-300 p-2 text-center text-blue-700 bg-blue-50/30 text-xs font-mono">{record.generatedAt}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="border border-gray-300 p-8 text-center text-gray-500">
                    아직 저장된 이력이 없습니다. PDF를 다운로드하면 이력이 자동으로 저장됩니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: activeTab === 'create' ? 'block' : 'none' }}>
        <div className="max-w-4xl mx-auto mb-8 bg-white p-6 rounded-lg shadow-sm border border-gray-200 no-print">
        <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2 flex justify-between items-center">
          스마트 TBM 보고서 설정
          {isSyncing ? (
            <span className="flex items-center text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded">
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> DB 연동 중...
            </span>
          ) : syncMsg ? (
            <span className="flex items-center text-sm font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded border border-green-200">
              <Database className="w-4 h-4 mr-1.5" /> 연동됨
            </span>
          ) : null}
        </h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">1. 사업장 선택</label>
            <select 
              value={selectedSiteId} 
              onChange={(e) => { setSelectedSiteId(e.target.value); setSelectedTasks([]); setSearchTerm(''); setAiAdvice(null); setIsDropdownOpen(false); }}
              className="w-full p-3 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">사업장을 선택해주세요</option>
              {sitesDB.map(site => (
                <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
              ))}
            </select>
            {currentSite && <p className="text-xs text-gray-500 mt-1 pl-1">📍 주소: {currentSite.address} (AI 날씨 분석용)</p>}
          </div>

          <div className={`transition-opacity ${!selectedSiteId ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="block text-sm font-bold text-gray-700 mb-2">2. 작업 일자</label>
            <input 
              type="date" 
              value={taskDate} 
              onChange={(e) => setTaskDate(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 mb-6"
            />

            <label className="block text-sm font-bold text-gray-700 mb-2">3. 작업명 선택 (검색 및 다중 선택)</label>
            
            {/* Selected Tasks Chips */}
            {selectedTasks.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedTasks.map(task => (
                  <span key={task} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center shadow-sm border border-blue-200">
                    {task}
                    <button 
                      onClick={() => {
                        setSelectedTasks(selectedTasks.filter(t => t !== task));
                        setAiAdvice(null);
                      }} 
                      className="ml-2 text-blue-500 hover:text-blue-700 focus:outline-none"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative mb-2">
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="추가할 작업명 검색..." 
                  value={searchTerm} 
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="w-full pl-10 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {isDropdownOpen && (
                <div className="absolute w-full border border-gray-300 rounded-md bg-white max-h-48 overflow-y-auto z-20 mt-1 shadow-xl">
                  {filteredTasks.length > 0 ? (
                    filteredTasks.map(task => {
                      const isSelected = selectedTasks.includes(task);
                      return (
                        <div 
                          key={task} 
                          onClick={() => { 
                            if (!isSelected) {
                              setSelectedTasks([...selectedTasks, task]);
                              setAiAdvice(null); 
                            }
                            setSearchTerm('');
                            setIsDropdownOpen(false);
                          }}
                          className={`p-3 cursor-pointer border-b border-gray-200 last:border-b-0 transition ${isSelected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-50 text-gray-700'}`}
                        >
                          <div className="flex justify-between items-center">
                            <span>{task}</span>
                            {isSelected && <Check className="w-4 h-4 text-green-500" />}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 text-gray-400 text-sm text-center">검색된 작업이 없습니다.</div>
                  )}
                  <div 
                    onClick={() => {
                      setIsDropdownOpen(false);
                      setSearchTerm('');
                      setIsNewTaskModalOpen(true);
                    }}
                    className="p-3 cursor-pointer border-t-2 border-blue-100 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 flex items-center justify-center transition"
                  >
                    ➕ [신규 작업 추가] 직접 입력하기
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">4. 관리감독자</label>
              <input 
                type="text" value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="홍길동 대리"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">5. 작업자 인원 (명)</label>
              <input 
                type="number" min="1" max="50" value={workerCount} onChange={(e) => setWorkerCount(parseInt(e.target.value) || '')}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">6. 현장 근로자 의견</label>
            <textarea 
              value={workerOpinion} onChange={(e) => setWorkerOpinion(e.target.value)}
              placeholder="예: 어제 비가 와서 땅이 미끄럽고 신호수가 부족합니다."
              className="w-full p-3 border border-gray-300 rounded-md h-24 resize-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="pt-4 border-t">
            <button 
              onClick={handleGenerateAdvice}
              disabled={isGeneratingAdvice || !selectedSiteId || selectedTasks.length === 0}
              className={`w-full py-3 rounded-lg font-bold flex items-center justify-center transition ${
                isGeneratingAdvice || !selectedSiteId || selectedTasks.length === 0 
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isGeneratingAdvice ? (
                <><RefreshCw className="w-5 h-5 mr-2 animate-spin" /> AI 분석 중...</>
              ) : (
                <><Lightbulb className="w-5 h-5 mr-2" /> AI 스마트 안전 어드바이스 생성</>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mb-6 flex justify-end gap-2 no-print">
         <button className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center" onClick={handleDownloadPDF} disabled={isGeneratingPDF}>
            <Download className="w-4 h-4 mr-2" /> {isGeneratingPDF ? '생성 중...' : 'PDF 다운로드'}
         </button>
      </div>

      <div id="report-content" ref={reportRef} className="max-w-4xl mx-auto bg-white shadow-lg px-8 pb-8 pt-2 report-container">
        
        <header className="border-b-4 border-blue-800 pb-4 mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-8 text-center tracking-tight">스마트 안전 TBM 위험성 평가서</h1>
          
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pdf-header-layout">
            <div className="flex-1 w-full pdf-mr-4">
              <div className="grid grid-cols-1 sm:grid-cols-[60%_40%] gap-y-3 gap-x-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-md border border-gray-200 pdf-info-grid">
                <div><p><strong>사업장:</strong> {currentSite?.siteName || '-'}</p></div>
                <div><p><strong>작업일자:</strong> {taskDate}</p></div>
                <div><p><strong>관리감독자:</strong> {supervisor || '-'}</p></div>
                <div><p><strong>작업인원:</strong> {workerCount ? `${workerCount} 명` : '-'}</p></div>
                <div className="col-span-1 sm:col-span-2 pdf-col-span-2"><p className="break-keep"><strong>작업명:</strong> {selectedTasks.length > 0 ? selectedTasks.join(', ') : '-'}</p></div>
              </div>
            </div>
            
            <div className="flex-shrink-0 w-full sm:w-auto overflow-x-auto">
              <table className="border-collapse border border-gray-400 text-sm bg-white min-w-[200px]">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 bg-gray-100 font-bold p-1 text-center w-6 align-middle" rowSpan={3}>결<br/>재</td>
                    <td className="border border-gray-400 bg-gray-100 p-1 text-center font-medium w-20 text-xs align-middle">작성</td>
                    <td className="border border-gray-400 bg-gray-100 p-1 text-center font-medium w-20 text-xs align-middle">검토</td>
                    <td className="border border-gray-400 bg-gray-100 p-1 text-center font-medium w-20 text-xs align-middle">승인</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 h-16 relative align-middle"></td>
                    <td className="border border-gray-400 h-16 relative align-middle"></td>
                    <td className="border border-gray-400 h-16 relative align-middle"></td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 h-5 text-center text-[10px] text-gray-500 tracking-widest align-middle">&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;</td>
                    <td className="border border-gray-400 h-5 text-center text-[10px] text-gray-500 tracking-widest align-middle">&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;</td>
                    <td className="border border-gray-400 h-5 text-center text-[10px] text-gray-500 tracking-widest align-middle">&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </header>

        <section className="mb-6 pdf-no-break flex flex-col w-full">
          <h3 className="text-lg font-bold border-l-4 border-blue-600 pl-2 mb-4">1. 위험성 평가표 (DB 연동)</h3>
          <div className="w-full overflow-x-auto rounded-sm border border-gray-300">
            <table className="w-full text-sm border-collapse min-w-[700px]">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 p-2 align-middle w-[15%] min-w-[90px] break-keep">세부작업</th>
                  <th className="border border-gray-300 p-2 align-middle w-[30%] min-w-[160px]">위험요인</th>
                  <th className="border border-gray-300 p-2 align-middle leading-tight text-xs whitespace-nowrap w-[48px]">빈도<br/>(L)</th>
                  <th className="border border-gray-300 p-2 align-middle leading-tight text-xs whitespace-nowrap w-[48px]">강도<br/>(S)</th>
                  <th className="border border-gray-300 p-2 align-middle leading-tight text-xs whitespace-nowrap w-[48px]">위험도<br/>(R)</th>
                  <th className="border border-gray-300 p-2 align-middle w-[30%] min-w-[160px]">관리 대책</th>
                </tr>
              </thead>
              <tbody>
                {currentRisks.length > 0 ? currentRisks.map((risk, idx) => (
                  <tr key={`${risk.id}-${idx}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <td className="border border-gray-300 p-2 text-center align-middle break-keep font-medium">{risk.subTask}</td>
                    <td className="border border-gray-300 p-2 align-middle break-keep">{risk.riskFactor}</td>
                    <td className="border border-gray-300 p-2 text-center align-middle">{risk.frequency}</td>
                    <td className="border border-gray-300 p-2 text-center align-middle">{risk.severity}</td>
                    <td className="border border-gray-300 p-2 text-center align-middle font-bold text-red-600">{risk.riskLevel}</td>
                    <td className="border border-gray-300 p-2 align-middle break-keep">{risk.controlMeasure}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="text-center p-4 text-gray-400 align-middle">작업을 선택해주세요.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6 pdf-no-break">
          <h3 className="text-lg font-bold border-l-4 border-blue-600 pl-2 mb-4">2. 현장 근로자 의견</h3>
          <div className="bg-gray-50 p-4 border border-gray-200 rounded min-h-[60px] text-gray-800">
            {workerOpinion || <span className="text-gray-400 italic">입력된 의견이 없습니다.</span>}
          </div>
        </section>

        <section className="mb-6">
          <div className="pdf-no-break mb-4">
            <h3 className="text-lg font-bold border-l-4 border-blue-600 pl-2">3. AI 스마트 안전 분석</h3>
          </div>
          {aiAdvice ? (
            <div className="border border-blue-200 bg-blue-50 rounded-lg overflow-hidden text-sm text-gray-800 flex flex-col">
              <div className="pdf-no-break px-5 py-3 border-b border-blue-100 bg-blue-50">
                <p className="whitespace-pre-wrap"><strong className="block mb-1">☁️ [날씨 및 현장 리스크]</strong>{aiAdvice.weatherAdvice}</p>
              </div>
              <div className="pdf-no-break px-5 py-3 border-b border-blue-100 bg-blue-50">
                <p className="whitespace-pre-wrap"><strong className="block mb-1">🚨 [관련 사고 사례]</strong>{aiAdvice.accidentCase}</p>
              </div>
              <div className="pdf-no-break px-5 py-3 border-b border-blue-100 bg-blue-50">
                <p className="whitespace-pre-wrap"><strong className="block mb-1">📊 [최근 중대재해 동향]</strong>{aiAdvice.recentTrend}</p>
              </div>
              <div className="pdf-no-break px-5 py-4 bg-blue-50">
                <strong className="block mb-2">✅ [현장 맞춤 핵심 안전수칙]</strong>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  {aiAdvice.safetyRules.map((rule, idx) => <li key={idx} className="pdf-no-break">{rule}</li>)}
                </ul>
              </div>
            </div>
          ) : (
            <div className="pdf-no-break text-center py-4 text-gray-500 text-sm border border-gray-200 bg-gray-50 rounded-lg">
              상단의 'AI 스마트 안전 어드바이스 생성' 버튼을 눌러 분석 결과를 확인하세요.
            </div>
          )}
        </section>

        {aiAdvice && aiAdvice.checklist && (
          <section className="mb-6">
            <div className="pdf-no-break mb-4">
              <h3 className="text-lg font-bold border-l-4 border-blue-600 pl-2">4. 작업 전 필수 체크리스트</h3>
            </div>
            <div className="bg-white border border-gray-300 rounded-lg p-4">
              <ul className="space-y-2">
                {aiAdvice.checklist.map((item, idx) => (
                  <li key={idx} className="flex items-start pdf-no-break">
                    <input type="checkbox" className="mt-1 mr-3 w-4 h-4 text-blue-600 rounded border-gray-300" />
                    <span className="text-gray-800 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="mb-6 pdf-no-break">
          <h3 className="text-lg font-bold border-l-4 border-blue-600 pl-2 mb-2">{aiAdvice && aiAdvice.checklist ? '5.' : '4.'} 근로자 확인 서명</h3>
          <p className="text-sm font-bold text-blue-700 bg-blue-50 p-3 rounded border border-blue-200 mb-4 tracking-tight text-center">
            위험 상황 발생 시 근로자 스스로 작업을 중지할 권리가 있음을 인지하였으며,<br />
            안전이 확보되지 않은 상태에서는 즉시 작업을 중지하고 보고할 것을 확인합니다.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {signatures.map((sig) => (
              <div key={sig.id} className="border border-gray-300 rounded overflow-hidden" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div className="bg-gray-100 border-b border-gray-300">
                  {isGeneratingPDF ? (
                    <div className="w-full px-2 py-1.5 text-center text-sm font-bold text-gray-700 min-h-[32px] flex items-center justify-center">
                      {sig.name || <span className="text-transparent">이름</span>}
                    </div>
                  ) : (
                    <input
                      type="text" placeholder="이름" value={sig.name}
                      onChange={(e) => setSignatures(prev => prev.map(s => s.id === sig.id ? { ...s, name: e.target.value } : s))}
                      className="w-full bg-transparent px-2 py-1.5 text-center text-sm font-bold text-gray-700 focus:outline-none focus:bg-white transition placeholder:text-gray-400"
                    />
                  )}
                </div>
                <div 
                  className="h-16 bg-white flex items-center justify-center cursor-pointer hover:bg-gray-50 relative group"
                  onClick={() => setActiveSignatureId(sig.id)}
                >
                  {sig.signature ? (
                    <img src={sig.signature} alt="서명" className="h-full object-contain p-1" />
                  ) : (
                    !isGeneratingPDF && (
                      <span className="text-xs text-gray-400 flex flex-col items-center"><PenTool className="w-3 h-3 mb-1" /> 서명</span>
                    )
                  )}
                  {sig.signature && !isGeneratingPDF && (
                    <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] hidden group-hover:flex items-center justify-center">
                      <span className="text-white text-xs font-medium">재서명</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        
        <footer className="mt-10 pt-6 border-t text-center text-xs text-gray-400 mt-auto pdf-no-break">
          에코비트 스마트 안전 시스템 ㅣ 본 보고서는 에코비트 안전보건실에서 제공하여 AI에 의해 실시간 생성되었습니다.
        </footer>
      </div>

      </div>

      {activeSignatureId !== null && (
        <SignaturePad 
          onClose={() => setActiveSignatureId(null)} 
          onSave={(dataUrl) => {
            setSignatures(prev => prev.map(s => s.id === activeSignatureId ? { ...s, signature: dataUrl } : s));
            setActiveSignatureId(null);
          }} 
        />
      )}

      {isNewTaskModalOpen && (
        <NewTaskModal 
          onClose={() => setIsNewTaskModalOpen(false)} 
          onSave={(taskName, risks) => {
            setCustomRisksLocal(prev => ({ ...prev, [taskName]: risks }));
            if (!selectedTasks.includes(taskName)) {
              setSelectedTasks([...selectedTasks, taskName]);
              setAiAdvice(null);
            }
            setIsNewTaskModalOpen(false);
          }} 
        />
      )}
    </div>
  );
}
