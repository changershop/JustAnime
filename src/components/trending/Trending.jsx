import { useLanguage } from "@/src/context/LanguageContext";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClosedCaptioning,
  faMicrophone,
  faFire
} from "@fortawesome/free-solid-svg-icons";
import getSafeTitle from "@/src/utils/getSafetitle";

const Trending = ({ trending, className }) => {
  const { language } = useLanguage();

  return (
    <div className={`bg-[#111113] border border-white/[0.06] rounded-xl py-4 px-2.5 shadow-xl ${className}`}>
      <div className="flex items-center gap-2.5 mb-3 px-2">
        <FontAwesomeIcon icon={faFire} className="text-amber-400" />
        <h2 className="text-lg font-bold tracking-tight text-white">Trending Now</h2>
      </div>
      <div className={`flex flex-col space-y-1.5 max-h-[600px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-track-[#141416] scrollbar-thumb-[#2a2a2e] hover:scrollbar-thumb-[#3a3a40] scrollbar-thumb-rounded`}>
        {trending &&
          trending.map((item, index) => (
            <div key={index} className="group">
              <Link
                to={`/${item.id}`}
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="block"
              >
                <div className="flex items-start gap-3 p-2 rounded-lg transition-colors hover:bg-[#1a1a1a]">
                  <div className="relative">
                    <img
                      src={item.poster}
                      alt={getSafeTitle(item.title, language, item.japanese_title)}
                      className="w-[50px] h-[70px] rounded object-cover"
                    />
                    <div className="absolute top-0 left-0 bg-white/90 text-black text-xs font-bold px-1.5 rounded-br">
                      #{index + 1}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors line-clamp-2">
                      {getSafeTitle(item.title, language, item.japanese_title)}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.tvInfo?.sub && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#2a2a2a] rounded text-gray-300">
                          <FontAwesomeIcon
                            icon={faClosedCaptioning}
                            className="text-[10px]"
                          />
                          <span className="text-[10px] font-medium">
                            {item.tvInfo.sub}
                          </span>
                        </div>
                      )}
                      {item.tvInfo?.dub && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#2a2a2a] rounded text-gray-300">
                          <FontAwesomeIcon
                            icon={faMicrophone}
                            className="text-[10px]"
                          />
                          <span className="text-[10px] font-medium">
                            {item.tvInfo.dub}
                          </span>
                        </div>
                      )}
                      {item.tvInfo?.showType && (
                        <span className="text-xs text-gray-400">
                          {item.tvInfo.showType}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
      </div>
    </div>
  );
};

export default Trending;
