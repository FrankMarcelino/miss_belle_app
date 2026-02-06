import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, UserPlus, Loader2, X } from 'lucide-react';

interface Patient {
  id: string;
  full_name: string;
  phone: string;
}

interface PatientAutocompleteProps {
  value: string | null;
  onChange: (patientId: string) => void;
  professionalId: string;
  placeholder?: string;
}

export default function PatientAutocomplete({
  value,
  onChange,
  professionalId,
  placeholder = 'Digite o nome do paciente...',
}: PatientAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Create form fields
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setShowCreateForm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load selected patient name if value provided
  useEffect(() => {
    if (value && !selectedPatient) {
      loadPatient(value);
    }
  }, [value]);

  const loadPatient = async (patientId: string) => {
    try {
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, phone')
        .eq('id', patientId)
        .single();

      if (data) {
        setSelectedPatient(data);
        setQuery(data.full_name);
      }
    } catch (error) {
      console.error('Error loading patient:', error);
    }
  };

  const searchPatients = async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('id, full_name, phone')
        .ilike('full_name', `%${searchQuery}%`)
        .eq('professional_id', professionalId)
        .limit(5)
        .order('full_name');

      if (error) throw error;
      setResults(data || []);
      setShowResults(true);
    } catch (error) {
      console.error('Error searching patients:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    setSelectedPatient(null);
    setShowCreateForm(false);

    // Debounce search
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      searchPatients(newQuery);
    }, 300);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setQuery(patient.full_name);
    setShowResults(false);
    onChange(patient.id);
  };

  const handleShowCreateForm = () => {
    setShowResults(false);
    setShowCreateForm(true);
    setNewPatientName(query);
  };

  const handleCreatePatient = async () => {
    if (!newPatientName.trim() || !newPatientPhone.trim()) {
      alert('Preencha nome e telefone do paciente');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .insert({
          full_name: newPatientName.trim(),
          phone: newPatientPhone.trim(),
          professional_id: professionalId,
        })
        .select('id, full_name, phone')
        .single();

      if (error) throw error;

      if (data) {
        setSelectedPatient(data);
        setQuery(data.full_name);
        setShowCreateForm(false);
        onChange(data.id);
      }
    } catch (error: any) {
      console.error('Error creating patient:', error);
      alert(error.message || 'Erro ao criar paciente');
    } finally {
      setCreating(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSelectedPatient(null);
    setResults([]);
    setShowResults(false);
    setShowCreateForm(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Input Field */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setShowResults(true);
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-text text-base"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-background rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        )}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && results.length > 0 && (
        <div className="autocomplete-list">
          {results.map((patient) => (
            <button
              key={patient.id}
              onClick={() => handleSelectPatient(patient)}
              className="autocomplete-item w-full text-left"
            >
              <div>
                <p className="font-medium text-text">{patient.full_name}</p>
                <p className="text-sm text-text-muted">{patient.phone}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results - Show Create Options */}
      {showResults && query.length >= 2 && results.length === 0 && !loading && (
        <div className="autocomplete-list">
          <div className="px-4 py-3 text-center">
            <p className="text-sm text-text-muted mb-3">
              Nenhum paciente encontrado com "{query}"
            </p>
            <button
              onClick={handleShowCreateForm}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors font-medium"
            >
              <UserPlus className="w-5 h-5" />
              Criar novo: {query}
            </button>
          </div>
        </div>
      )}

      {/* Create Patient Form */}
      {showCreateForm && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background-card border border-accent/30 rounded-lg shadow-lg p-4 z-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text">Novo Paciente</h3>
            <button
              onClick={() => setShowCreateForm(false)}
              className="p-1 hover:bg-champagne-nuvem rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Nome Completo *
              </label>
              <input
                type="text"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                className="w-full px-3 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-base"
                placeholder="Ex: Maria Silva"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Telefone *
              </label>
              <input
                type="tel"
                value={newPatientPhone}
                onChange={(e) => setNewPatientPhone(e.target.value)}
                className="w-full px-3 py-2 bg-champagne-nuvem border border-accent/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text text-base"
                placeholder="(11) 98765-4321"
              />
            </div>

            <button
              onClick={handleCreatePatient}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  Criar e Continuar
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
