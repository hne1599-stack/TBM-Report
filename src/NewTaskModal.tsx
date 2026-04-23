import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { RiskFactor } from './data';

interface NewTaskModalProps {
  onSave: (taskName: string, risks: RiskFactor[]) => void;
  onClose: () => void;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({ onSave, onClose }) => {
  const [taskName, setTaskName] = useState('');
  
  const [subTask, setSubTask] = useState('');
  const [riskFactor, setRiskFactor] = useState('');
  const [frequency, setFrequency] = useState(3);
  const [severity, setSeverity] = useState(3);
  const [controlMeasure, setControlMeasure] = useState('');

  const [addedRisks, setAddedRisks] = useState<RiskFactor[]>([]);

  const riskLevelVal = frequency * severity;
  let riskLevelStr = `${riskLevelVal} (하)`;
  if (riskLevelVal >= 9) riskLevelStr = `${riskLevelVal} (상)`;
  else if (riskLevelVal >= 4) riskLevelStr = `${riskLevelVal} (중)`;
  
  const handleAddToList = () => {
    if (!subTask.trim() || !riskFactor.trim() || !controlMeasure.trim()) {
      alert('세부작업, 위험요인, 관리 대책을 모두 입력해주세요.');
      return;
    }
    const newRisk: RiskFactor = {
      id: 'custom-' + Date.now() + Math.random().toString(36).substring(2, 9),
      subTask,
      riskFactor,
      frequency,
      severity,
      riskLevel: riskLevelStr,
      controlMeasure
    };
    setAddedRisks([...addedRisks, newRisk]);
    setRiskFactor('');
    setControlMeasure('');
    setFrequency(3);
    setSeverity(3);
  };

  const removeRisk = (id: string) => {
    setAddedRisks(addedRisks.filter(r => r.id !== id));
  };

  const handleSave = () => {
    if (!taskName.trim()) {
      alert('작업명을 입력해주세요.');
      return;
    }
    
    const finalRisks = [...addedRisks];
    // 만약 작성중인 항목이 있다면 자동 추가
    if (subTask.trim() && riskFactor.trim() && controlMeasure.trim()) {
      finalRisks.push({
        id: 'custom-' + Date.now(),
        subTask,
        riskFactor,
        frequency,
        severity,
        riskLevel: riskLevelStr,
        controlMeasure
      });
    }

    if (finalRisks.length === 0) {
      alert('최소 1개 이상의 세부작업 항목을 입력해주세요.');
      return;
    }

    onSave(`[신규] ${taskName.trim()}`, finalRisks);
  };

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.6)] flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50 flex-shrink-0">
          <h3 className="font-bold text-gray-800">신규 작업 위험성 평가 추가</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto w-[400px] sm:w-auto flex-1">
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-1">작업명 <span className="text-red-500">*</span></label>
            <input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="예: 굴착 작업" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-blue-50" />
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-6 space-y-4">
            <h4 className="font-bold text-md text-gray-800 border-b pb-2">항목 추가 입력란</h4>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">세부작업</label>
              <input type="text" value={subTask} onChange={e => setSubTask(e.target.value)} placeholder="예: 굴착 토사 반출" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">위험요인</label>
              <input type="text" value={riskFactor} onChange={e => setRiskFactor(e.target.value)} placeholder="예: 토사 반출 시 주변 사면 붕괴" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">빈도(L)</label>
                <select value={frequency} onChange={e => setFrequency(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                  {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">강도(S)</label>
                <select value={severity} onChange={e => setSeverity(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                  {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">예상 위험도(R)</label>
              <div className="p-2 bg-white rounded border border-gray-200 text-center font-bold text-gray-700">{riskLevelStr}</div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">관리 대책</label>
              <input type="text" value={controlMeasure} onChange={e => setControlMeasure(e.target.value)} placeholder="예: 토사 반출 작업장 주변 굴착면 기울기 준수 및 붕괴 위험 방지 조치 실시" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={handleAddToList} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 transition flex items-center">
                <Plus className="w-4 h-4 mr-1" /> 위 항목을 리스트에 추가
              </button>
            </div>
          </div>

          {addedRisks.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <h4 className="font-bold text-sm text-blue-700">추가된 세부작업 리스트 ({addedRisks.length}건)</h4>
              {addedRisks.map((risk, index) => (
                <div key={risk.id} className="p-3 border border-blue-200 bg-white rounded-lg relative group">
                  <div className="pr-8">
                    <p className="text-xs font-bold text-gray-500 mb-1">[{index + 1}] {risk.subTask}</p>
                    <p className="text-sm font-medium text-gray-800 line-clamp-1">{risk.riskFactor}</p>
                    <p className="text-xs text-gray-500 mt-1">L:{risk.frequency} S:{risk.severity} R:{risk.riskLevel}</p>
                  </div>
                  <button onClick={() => removeRisk(risk.id)} className="absolute top-1/2 -translate-y-1/2 right-3 p-1.5 bg-red-50 text-red-500 rounded hover:bg-red-100 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
        </div>
        
        <div className="p-4 border-t flex justify-end gap-3 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition">취소</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">
             작업 최종 반영하기
          </button>
        </div>
      </div>
    </div>
  );
};
