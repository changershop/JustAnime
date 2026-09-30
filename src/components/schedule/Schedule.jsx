import { useState, useEffect, useRef } from "react";
import getSchedInfo from "../../utils/getScheduleInfo.utils";
import { Pagination, Navigation } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import BouncingLoader from "../ui/bouncingloader/Bouncingloader";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay } from "@fortawesome/free-solid-svg-icons";
import "./schedule.css";
import { Link } from "react-router-dom";

const Schedule = () => {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [currentActiveIndex, setCurrentActiveIndex] = useState(null);
  const [scheduleData, setscheduleData] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const cardRefs = useRef([]);
  const swiperRef = useRef(null);
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString("default", { month: "short" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const GMTOffset = `GMT ${new Date().getTimezoneOffset() <= 0 ? "+" : "-"}${String(Math.floor(Math.abs(new Date().getTimezoneOffset()) / 60)).padStart(2, "0")}:${String(Math.abs(new Date().getTimezoneOffset()) % 60).padStart(2, "0")}`;

  useEffect(() => {
    const monthsArr = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      monthsArr.push({
        day,
        monthName: date.toLocaleString("default", { month: "short" }),
        dayname: date.toLocaleString("default", { weekday: "short" }),
        fulldate: date.toISOString().split('T')[0]
      });
    }
    setDates(monthsArr);

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [year, month, daysInMonth]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayIndex = dates.findIndex((date) => date.fulldate === today);

    if (todayIndex !== -1) {
      setCurrentActiveIndex(todayIndex);
      toggleActive(todayIndex);
    }
  }, [dates]);

  const fetchSched = async (date) => {
    try {
      setLoading(true);

      // Check if cached data exists
      const cachedData = localStorage.getItem(`schedule-${date}`);
      const parsedData = cachedData ? JSON.parse(cachedData) : null;
      if (Array.isArray(parsedData) && parsedData.length > 0) {
        setscheduleData(parsedData);
      } else {
        const data = await getSchedInfo(date);
        const validData = Array.isArray(data) ? data : [];
        setscheduleData(validData);
        if (validData.length > 0) {
          localStorage.setItem(`schedule-${date}`, JSON.stringify(validData));
        }
      }
    } catch (err) {
      console.error("Error fetching schedule info:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = (index) => {
    cardRefs.current.forEach((card) => {
      if (card) {
        card.classList.remove("active");
      }
    });
    if (cardRefs.current[index]) {
      cardRefs.current[index].classList.add("active");
      if (dates[index] && dates[index].fulldate) {
        fetchSched(dates[index].fulldate);
      }
      setCurrentActiveIndex(index);
    }
  };

  const toggleShowAll = () => {
    setShowAll(!showAll);
  };

  useEffect(() => {
    setShowAll(false);
    if (currentActiveIndex !== null && swiperRef.current) {
      swiperRef.current.slideTo(currentActiveIndex);
    }
  }, [currentActiveIndex]);

  return (
    <>
      <div className="w-full mt-8 max-[480px]:mt-6">
        <div className="flex items-center justify-between max-[570px]:flex-col max-[570px]:items-start max-[570px]:gap-y-2">
          <div className="font-bold text-2xl text-white max-[478px]:text-[18px]">
            Estimated Schedule
          </div>
          <p className="leading-[28px] px-3 bg-zinc-800 text-white rounded-md text-[14px] font-medium max-[478px]:text-[12px] max-[275px]:text-[10px]">
            ({GMTOffset}) {currentTime.toLocaleDateString()}{" "}
            {currentTime.toLocaleTimeString()}
          </p>
        </div>
      </div>
      <div className="w-full overflow-x-scroll space-x-4 scrollbar-hide pt-6 px-4 max-[480px]:px-2 max-[478px]:pt-4">
        <div className="relative w-full">
          <Swiper
            slidesPerView={3}
            spaceBetween={2}
            breakpoints={{
              250: { slidesPerView: 3, spaceBetween: 8 },
              640: { slidesPerView: 4, spaceBetween: 8 },
              768: { slidesPerView: 5, spaceBetween: 8 },
              1024: { slidesPerView: 7, spaceBetween: 8 },
              1300: { slidesPerView: 7, spaceBetween: 8 },
            }}
            modules={[Pagination, Navigation]}
            navigation={{
              nextEl: ".next",
              prevEl: ".prev",
            }}
            onSwiper={(swiper) => (swiperRef.current = swiper)}
          >
            {dates &&
              dates.map((date, index) => (
                <SwiperSlide key={index}>
                  <div
                    ref={(el) => (cardRefs.current[index] = el)}
                    onClick={() => toggleActive(index)}
                    className={`h-[60px] flex flex-col justify-center items-center w-full text-center rounded-lg cursor-pointer transition-all duration-200 ${currentActiveIndex === index
                      ? "bg-white text-black"
                      : "bg-zinc-800 text-white hover:bg-zinc-700"
                      }`}
                  >
                    <div className="text-[16px] font-bold max-[400px]:text-[14px] max-[350px]:text-[12px]">
                      {date.dayname}
                    </div>
                    <div
                      className={`text-[13px] max-[400px]:text-[11px] ${currentActiveIndex === index
                        ? "text-zinc-800"
                        : "text-zinc-400"
                        } max-[350px]:text-[10px]`}
                    >
                      {date.monthName} {date.day}
                    </div>
                  </div>
                </SwiperSlide>
              ))}
          </Swiper>
          <button className="next absolute top-1/2 right-[-12px] transform -translate-y-1/2 flex justify-center items-center cursor-pointer">
            <FaChevronRight className="text-[12px]" />
          </button>
          <button className="prev absolute top-1/2 left-[-12px] transform -translate-y-1/2 flex justify-center items-center cursor-pointer">
            <FaChevronLeft className="text-[12px]" />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="w-full h-[60px] flex justify-center items-center">
          <BouncingLoader />
        </div>
      ) : !scheduleData || scheduleData.length === 0 ? (
        <div className="w-full h-[60px] flex justify-center items-center mt-4 text-lg text-zinc-400">
          No data to display
        </div>
      ) : error ? (
        <div className="w-full h-[60px] flex justify-center items-center mt-4 text-lg text-zinc-400">
          Something went wrong
        </div>
      ) : (
        <div className="flex flex-col mt-4 items-start">
          {(showAll
            ? scheduleData
            : Array.isArray(scheduleData)
              ? scheduleData.slice(0, 7)
              : []
          ).map((item, idx) => (
            <Link
              to={`/${item.id}`}
              key={idx}
              className="w-full flex justify-between py-3 border-zinc-800 border-b-[1px] group cursor-pointer hover:bg-zinc-900/50 px-2 transition-all duration-200 max-[325px]:py-2"
            >
              <div className="flex items-center max-w-[500px] gap-x-4 max-[400px]:gap-x-2">
                <div className="text-base font-medium text-zinc-500 group-hover:text-white transition-all duration-200 max-[600px]:text-[14px] max-[275px]:text-[12px]">
                  {item.time || "N/A"}
                </div>
                <h3 className="text-[16px] font-medium line-clamp-1 group-hover:text-white transition-all duration-200 max-[600px]:text-[14px] max-[275px]:text-[12px]">
                  {item.title || "N/A"}
                </h3>
              </div>
              <div className="flex items-center gap-x-2 py-1 px-3 rounded-md bg-zinc-800 group-hover:bg-white transition-all duration-200">
                <FontAwesomeIcon
                  icon={faPlay}
                  className="mt-[1px] text-[10px] max-[320px]:text-[8px] text-zinc-400 group-hover:text-black"
                />
                <p className="text-[13px] text-zinc-400 group-hover:text-black max-[275px]:text-[12px]">
                  EP {item.episode_no || "N/A"}
                </p>
              </div>
            </Link>
          ))}
          {scheduleData.length > 7 && (
            <button
              onClick={toggleShowAll}
              className="text-zinc-400 py-3 hover:text-white font-medium transition-all duration-200 max-sm:text-[13px]"
            >
              {showAll ? "Show Less" : "Show More"}
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default Schedule;
