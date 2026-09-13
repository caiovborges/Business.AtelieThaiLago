import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, View, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

const locales = {
    'pt-BR': ptBR,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    type: 'EVENT' | 'FOLLOWUP';
    status?: string; // For followups: pending/done
    originalData?: any;
}

const CalendarPage = () => {
    const navigate = useNavigate();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<View>(Views.MONTH);
    const [date, setDate] = useState(new Date());

    const handleNavigate = (newDate: Date) => {
        setDate(newDate);
    };

    const fetchData = async () => {
        setLoading(true);
        const allEvents: CalendarEvent[] = [];

        // 1. Fetch Events
        const { data: eventos, error: evError } = await supabase
            .from('eventos')
            .select('id, nome, data_evento, status, local, observacoes');

        if (eventos) {
            eventos.forEach((ev: any) => {
                if (ev.data_evento) {
                    const start = new Date(ev.data_evento + 'T12:00:00'); // Mid-day to avoid timezone offset
                    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // 4 hours default

                    allEvents.push({
                        id: ev.id,
                        title: ev.nome,
                        start,
                        end,
                        type: 'EVENT',
                        status: ev.status,
                        originalData: ev
                    });
                }
            });
        }
        // 2. Fetch Follow-ups
        const { data: followups, error: fuError } = await supabase
            .from('lead_followups')
            .select(`
                id,
                scheduled_at,
                type,
                notes,
                done,
                leads (name)
            `);

        if (followups) {
            followups.forEach((fu: any) => {
                const start = new Date(fu.scheduled_at);
                const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min duration default

                allEvents.push({
                    id: fu.id,
                    title: `${fu.type}: ${fu.leads?.name || 'Lead'}`,
                    start,
                    end,
                    type: 'FOLLOWUP',
                    status: fu.done ? 'DONE' : 'PENDING',
                    originalData: fu
                });
            });
        }

        setEvents(allEvents);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const eventStyleGetter = (event: CalendarEvent) => {
        let style = {
            backgroundColor: '#3174ad',
            borderRadius: '4px',
            opacity: 0.8,
            color: 'white',
            border: '0px',
            display: 'block'
        };

        if (event.type === 'EVENT') {
            style.backgroundColor = '#e0067e'; // Primary Pink
        } else if (event.type === 'FOLLOWUP') {
            if (event.status === 'DONE') {
                style.backgroundColor = '#9ca3af'; // Gray
                style.opacity = 0.6;
            } else {
                style.backgroundColor = '#f97316'; // Orange
            }
        }

        return {
            style
        };
    };

    const handleSelectEvent = (event: CalendarEvent) => {
        if (event.type === 'EVENT') {
            // Navigate to event details? Or just alert for now
            // navigate(`/events/${event.id}`); // Verify route later
            alert(`Evento: ${event.title}\nData: ${event.start.toLocaleDateString()}`);
        } else {
            // Followup
            // Ideally open lead modal. For now alert.
            alert(`Follow-up: ${event.title}\nNotas: ${event.originalData.notes}\nStatus: ${event.status === 'DONE' ? 'Concluído' : 'Pendente'}\n\nPara editar, vá em Leads > ${event.originalData.leads?.name}`);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light overflow-hidden">
            <header className="px-8 py-6 bg-white/50 border-b-2 border-secondary/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10">
                <div>
                    <h2 className="font-display text-3xl font-bold text-secondary">Calendário</h2>
                    <p className="font-body text-gray-600 mt-1">Visualize seus eventos e tarefas de follow-up.</p>
                </div>
                <button
                    onClick={() => {
                        let icsData = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//AtelieThaiLago//Eventos//PT-BR\nCALSCALE:GREGORIAN\n";
                        events.filter(e => e.type === 'EVENT').forEach(e => {
                            icsData += "BEGIN:VEVENT\n";
                            icsData += `UID:${e.id}@ateliethailago.com\n`;
                            const dtStart = e.start.toISOString().replace(/[-:]/g, '').split('.')[0] + "Z";
                            const dtEnd = e.end.toISOString().replace(/[-:]/g, '').split('.')[0] + "Z";
                            icsData += `DTSTAMP:${dtStart}\n`;
                            icsData += `DTSTART:${dtStart}\n`;
                            icsData += `DTEND:${dtEnd}\n`;
                            icsData += `SUMMARY:${e.title}\n`;
                            if (e.originalData?.local) {
                                icsData += `LOCATION:${e.originalData.local}\n`;
                            }
                            icsData += "END:VEVENT\n";
                        });
                        icsData += "END:VCALENDAR";

                        const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
                        const link = document.createElement('a');
                        link.href = window.URL.createObjectURL(blob);
                        link.setAttribute('download', 'atelie_thai_lago.ics');
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }}
                    className="flex items-center gap-2 bg-primary hover:bg-[#c0056b] text-white px-4 py-2 border-2 border-secondary shadow-hard hover:translate-y-[2px] hover:shadow-none transition-all rounded-sm font-display font-bold text-sm tracking-wider uppercase"
                >
                    <span className="material-symbols-outlined">sync</span>
                    Sincronizar iPhone
                </button>
            </header>

            <div className="flex-1 p-8 overflow-y-auto">
                <div className="bg-white p-6 rounded-sm shadow-sm border-2 border-secondary/20 h-[600px]">
                    <Calendar
                        localizer={localizer}
                        events={events}
                        startAccessor="start"
                        endAccessor="end"
                        style={{ height: '100%' }}
                        culture='pt-BR'
                        messages={{
                            next: "Próximo",
                            previous: "Anterior",
                            today: "Hoje",
                            month: "Mês",
                            week: "Semana",
                            day: "Dia",
                            agenda: "Agenda",
                            date: "Data",
                            time: "Hora",
                            event: "Evento",
                            noEventsInRange: "Sem eventos neste período."
                        }}
                        eventPropGetter={eventStyleGetter}
                        onSelectEvent={handleSelectEvent}
                        views={['month', 'week', 'day', 'agenda']}
                        view={view}
                        onView={setView}
                        date={date}
                        onNavigate={handleNavigate}
                    />
                </div>
            </div>
        </div>
    );
};

export default CalendarPage;
