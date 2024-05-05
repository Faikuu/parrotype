import { faRightToBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { TApiCallParams, apiCall } from "@utils/api";
import { Translator } from "@utils/translator";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
  } from 'chart.js';
  import { Line } from 'react-chartjs-2';

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

interface Entry {
    modelId: number;
    wpm: number;
    createdDate: string;
}

interface AggregatedData {
    date: string;
    wpmAvg: number;
    wpmMax: number;
}

function aggregateDataByDay(data: Entry[]): AggregatedData[] {
    const aggregatedData: { [date: string]: { wpmTotal: number; wpmCount: number; wpmMax: number } } = {};

    data.forEach(entry => {
        const date = entry.createdDate.split('T')[0]; // Extracting date part

        if (!aggregatedData[date]) {
            aggregatedData[date] = { wpmTotal: 0, wpmCount: 0, wpmMax: -Infinity };
        }

        aggregatedData[date].wpmTotal += entry.wpm;
        aggregatedData[date].wpmCount++;
        aggregatedData[date].wpmMax = Math.max(aggregatedData[date].wpmMax, entry.wpm);
    });

    const result = Object.keys(aggregatedData).map(date => ({
        date,
        wpmAvg: aggregatedData[date].wpmTotal / aggregatedData[date].wpmCount,
        wpmMax: aggregatedData[date].wpmMax
    }));

    return result;
}

async function fetchData() {
    try {
      const result = await apiCall<any>({ url: `/stat`, method: 'GET' });
      return result.data;
    } catch (error) {
      console.error(error);
      return '';
    }
  }

export function MyAccount() {
    const navigate = useNavigate();
    const [username, setUsername] = useState<string>('');
    const [statistics, setStatistics] = useState<any[]>([]);
    const [wpmData, setWpmData] = useState<any>(
        {
            labels: [],
            datasets: [{
                label: Translator('myaccount.avgWpm'),
                data: [],
                fill: false,
                borderColor: 'lime',
                tension: 0.1
            }]
        }
    );


    const { data: statsTemp } = useQuery({
        queryKey: ['stats'],
        queryFn: () => fetchData(),
    });
    useEffect(() => {
        if (!statsTemp) return;
        setStatistics(aggregateDataByDay(statsTemp));
    }, [statsTemp]);

    useEffect(() => {
        console.log(statistics);
        if (!statistics) return;
        setWpmData({
            labels: statistics.map((stat: AggregatedData) => stat.date),
            datasets: [{
                label: Translator('myaccount.avgWpm'),
                data: statistics.map((stat: AggregatedData) => stat.wpmAvg),
                fill: false,
                borderColor: 'lime',
                tension: 0.1
            },
            {
                label: Translator('myaccount.maxWpm'),
                data: statistics.map((stat: AggregatedData) => stat.wpmMax),
                fill: false,
                borderColor: 'red',
                tension: 0.1
            }]
        });
    }, [statistics]);

    useEffect(() => {
        let username = document.cookie
            .split('; ')
            .find(row => row.startsWith('user='))
            ?.split('=')[1];
        if (username){
            username = JSON.parse(username).email;
            setUsername(username || '');
        } else {
            navigate('/')
        }
    }, []);

    const handleLogout = async () => {
        const data: TApiCallParams = {
          url: `/auth/logout`,
          method: 'POST',
        };
        const response = await apiCall(data) as any;
        if (response.status < 300) {
          navigate('/');
        }
    }

    return (
        <div className="flex flex-col justify-center items-center gap-4 mt-32 p-4">
            <div className="flex flex-col justify-center items-center bg-black bg-opacity-25 p-4 rounded-lg">
                <span>{Translator('myaccount.title')}</span>
                <span>{username}</span>
            </div>
            <div className="bg-black bg-opacity-25 p-4 rounded-lg w-full text-center">
                {/* Stats: */}
                {/* <pre>{JSON.stringify(statistics, null, 2)}</pre> */}
                <Line data={wpmData} />
            </div>
            <div>
                <button className="flex flex-row justify-center items-center gap-4" onClick={() => handleLogout()}>
                    <span>{Translator('myaccount.logout')}</span>
                    <FontAwesomeIcon color="salmon" icon={faRightToBracket} />
                </button>
            </div>
        </div>
    );
}

export default MyAccount