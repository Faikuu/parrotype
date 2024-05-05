import { i18n } from "src/i18n";

export const Footer: React.FC = () => {
    const languages = [
        { code: 'en', name: 'English', img: 'https://flagicons.lipis.dev/flags/4x3/gb.svg' },
        { code: 'pl', name: 'Polish', img:'https://flagicons.lipis.dev/flags/4x3/pl.svg' },
    ];

    const handleChangeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        window.location.reload();
    }

    return (
        <div className="fixed bottom-0 w-full flex justify-between p-4 px-16 border-1 border-black shadow-inner text-white " style={{boxShadow: '-2px -2px 10px rgba(0, 0, 0, 0.3)'}}>
            <div></div>
            <div></div>
            <div className="grid grid-cols-3">
                {languages.map((language) => (
                    <img
                        key={language.code}
                        src={language.img}
                        alt={language.name}
                        onClick={() => handleChangeLanguage(language.code)}
                        className="h-6 p-1 cursor-pointer"
                    />
                ))}
            </div>
        </div>
    );
};
