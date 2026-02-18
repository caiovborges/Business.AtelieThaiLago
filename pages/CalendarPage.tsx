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

        // 1. Fetch Events (REMOVED as requested)


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
            <header className="px-8 py-6 bg-white/50 border-b-2 border-secondary/10 flex justify-between items-center z-10">
                <div>
                    <h2 className="font-display text-3xl font-bold text-secondary">Calendário</h2>
                    <p className="font-body text-gray-600 mt-1">Visualize seus eventos e tarefas de follow-up.</p>
                </div>

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
