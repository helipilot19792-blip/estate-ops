"use client";

type PortalLoadingSceneProps = {
  eyebrow?: string;
  title: string;
  body: string;
  badge?: string;
};

export default function PortalLoadingScene({
  eyebrow = "Portal workspace",
  title,
  body,
  badge = "Loading",
}: PortalLoadingSceneProps) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-[#d6e4cf] bg-[linear-gradient(180deg,#f8fbf6_0%,#f0f6ec_45%,#e6efe0_100%)] p-5 shadow-[0_22px_54px_rgba(35,75,42,0.08)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#5d7758]">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#203423] sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#566a57] sm:text-base">
            {body}
          </p>
        </div>

        <span className="w-fit rounded-full border border-[#cad8c2] bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#49614c] shadow-sm">
          {badge}
        </span>
      </div>

      <div className="mt-6 rounded-[28px] border border-[#cfdbc8] bg-[linear-gradient(180deg,#edf4e8_0%,#e2ebdb_100%)] px-4 py-5 sm:px-6">
        <div className="relative h-[210px] overflow-hidden rounded-[22px] border border-[#c9d7c2] bg-[linear-gradient(180deg,#eef6fb_0%,#f8fbfd_38%,#e5eee0_38%,#d5e3ce_100%)]">
          <div className="absolute left-7 top-6 h-8 w-8 rounded-full bg-white/85 blur-[0.5px]" />
          <div className="absolute right-20 top-9 h-3 w-16 rounded-full bg-white/65" />
          <div className="absolute right-8 top-13 h-4 w-24 rounded-full bg-white/55" />

          <div className="absolute inset-x-0 bottom-0 h-[94px] bg-[linear-gradient(180deg,#9db789_0%,#89a775_100%)]" />
          <div className="absolute inset-x-0 bottom-[58px] h-[34px] bg-[repeating-linear-gradient(90deg,rgba(66,101,54,0.18)_0_12px,rgba(66,101,54,0)_12px_24px)] opacity-70" />
          <div className="portal-loader-cut absolute bottom-[58px] left-0 h-[34px] w-full origin-left bg-[repeating-linear-gradient(90deg,rgba(229,241,219,0.72)_0_12px,rgba(207,226,194,0.72)_12px_24px)]" />
          <div className="portal-loader-return-cut absolute bottom-[34px] right-0 h-[22px] w-full origin-right bg-[repeating-linear-gradient(90deg,rgba(216,232,203,0.56)_0_12px,rgba(195,216,180,0.56)_12px_24px)]" />
          <div className="absolute inset-x-0 bottom-[92px] h-[1px] bg-white/35" />

          <div className="portal-loader-track absolute bottom-[54px] left-[-118px]">
            <div className="portal-loader-mower relative h-[120px] w-[220px]">
              <div className="absolute bottom-[13px] left-[72px] h-[12px] w-[126px] rounded-full bg-[#557148]/25 blur-[3px]" />

              <div className="absolute bottom-[58px] left-[142px] h-[25px] w-[4px] origin-bottom -rotate-[19deg] rounded-full bg-[#2d3b2a]" />
              <div className="absolute bottom-[79px] left-[133px] h-[4px] w-[22px] rounded-full bg-[#2d3b2a]" />
              <div className="absolute bottom-[61px] left-[137px] h-[16px] w-[16px] rounded-full border-[3px] border-[#33432e] bg-transparent" />

              <div className="absolute bottom-[45px] left-[75px] h-[13px] w-[31px] rounded-[8px_5px_4px_4px] bg-[#2d3b2a]" />
              <div className="absolute bottom-[54px] left-[81px] h-[29px] w-[24px] rounded-[7px_7px_4px_4px] bg-[#3f5338] shadow-[inset_-4px_0_0_rgba(0,0,0,0.12)]" />
              <div className="absolute bottom-[26px] left-[84px] h-[40px] w-[58px] rounded-[12px_18px_12px_12px] bg-[#516b44] shadow-[inset_0_-5px_0_rgba(0,0,0,0.10)]" />
              <div className="absolute bottom-[53px] left-[102px] h-[24px] w-[11px] rounded-full bg-[#33432e]" />
              <div className="absolute bottom-[72px] left-[93px] h-[18px] w-[33px] rounded-[16px_16px_10px_10px] bg-[#d7be8e] shadow-[inset_0_-3px_0_rgba(84,65,44,0.12)]" />
              <div className="absolute bottom-[84px] left-[104px] h-[18px] w-[15px] rounded-[50%_50%_44%_44%] bg-[#8d6248]" />
              <div className="absolute bottom-[96px] left-[101px] h-[7px] w-[22px] rounded-[7px_7px_3px_3px] bg-[#3f5338]" />
              <div className="absolute bottom-[94px] left-[111px] h-[4px] w-[16px] rounded-full bg-[#3f5338]" />
              <div className="absolute bottom-[67px] left-[79px] h-[17px] w-[11px] origin-top rotate-[18deg] rounded-full bg-[#bd8861]" />
              <div className="absolute bottom-[67px] left-[128px] h-[17px] w-[11px] origin-top -rotate-[20deg] rounded-full bg-[#bd8861]" />
              <div className="absolute bottom-[48px] left-[84px] h-[27px] w-[11px] origin-top rounded-full bg-[#40553a]" />
              <div className="absolute bottom-[48px] left-[124px] h-[27px] w-[11px] origin-top rounded-full bg-[#40553a]" />
              <div className="absolute bottom-[28px] left-[82px] h-[26px] w-[16px] rounded-full bg-[#273327]" />
              <div className="absolute bottom-[28px] left-[122px] h-[26px] w-[16px] rounded-full bg-[#273327]" />

              <div className="absolute bottom-[52px] left-[124px] h-[5px] w-[55px] origin-left rounded-full bg-[#33432e] rotate-[16deg]" />
              <div className="absolute bottom-[65px] left-[171px] h-[9px] w-[9px] rounded-full bg-[#33432e]" />

              <div className="absolute bottom-[24px] left-[132px] h-[28px] w-[52px] rounded-[18px_16px_14px_14px] bg-[#789565] shadow-[inset_0_-5px_0_rgba(0,0,0,0.13),inset_0_2px_0_rgba(255,255,255,0.18)]" />
              <div className="absolute bottom-[38px] left-[167px] h-[7px] w-[14px] rounded-[6px_9px_6px_4px] bg-[#d9e6ba] shadow-[0_0_7px_rgba(242,255,198,0.7)]" />
              <div className="absolute bottom-[30px] left-[142px] h-[4px] w-[25px] rounded-full bg-[#536c48]" />
              <div className="absolute bottom-[44px] left-[146px] h-[8px] w-[4px] rounded-t-full bg-[#34452f]" />
              <div className="absolute bottom-[18px] left-[126px] h-[14px] w-[64px] rounded-full bg-[#6f8b5f]/45 blur-[1px]" />

              <div className="portal-loader-wheel absolute bottom-[18px] left-[94px] h-[26px] w-[26px] rounded-full border-[5px] border-[#354235] bg-[#596759]" />
              <div className="portal-loader-wheel absolute bottom-[18px] left-[156px] h-[24px] w-[24px] rounded-full border-[4px] border-[#354235] bg-[#596759]" />

              <div className="portal-loader-blade absolute bottom-[14px] left-[122px] h-[10px] w-[70px] rounded-full bg-[radial-gradient(circle,rgba(170,205,135,0.75)_0_18%,transparent_19%)] opacity-60" />
              <div className="portal-loader-clipping absolute bottom-[25px] left-[65px] h-[4px] w-[4px] rounded-full bg-[#dcebc7]" />
              <div className="portal-loader-clipping portal-loader-clipping-two absolute bottom-[31px] left-[57px] h-[3px] w-[3px] rounded-full bg-[#c9dda9]" />
              <div className="portal-loader-clipping portal-loader-clipping-three absolute bottom-[21px] left-[49px] h-[5px] w-[5px] rounded-full bg-[#e6f0d1]" />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="rounded-full border border-white/70 bg-white/78 px-4 py-2 text-xs font-medium tracking-[0.08em] text-[#546955] shadow-sm">
              Syncing workspace data and preparing the next screen.
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .portal-loader-track {
          animation: portal-loader-drive 8s ease-in-out infinite;
          will-change: left, bottom, transform;
        }

        .portal-loader-mower {
          animation: portal-loader-suspension 0.34s ease-in-out infinite alternate;
          transform-origin: 52% 82%;
        }

        .portal-loader-cut {
          animation: portal-loader-cut-progress 8s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .portal-loader-return-cut {
          animation: portal-loader-return-progress 8s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .portal-loader-wheel {
          animation: portal-loader-spin 0.8s linear infinite;
        }

        .portal-loader-blade {
          animation: portal-loader-blade 0.35s linear infinite;
        }

        .portal-loader-clipping {
          animation: portal-loader-clipping 0.8s ease-out infinite;
        }

        .portal-loader-clipping-two {
          animation-delay: -0.27s;
        }

        .portal-loader-clipping-three {
          animation-delay: -0.53s;
        }

        @keyframes portal-loader-drive {
          0% {
            left: -118px;
            bottom: 54px;
            transform: scaleX(1);
          }
          43% {
            left: calc(100% - 102px);
            bottom: 54px;
            transform: scaleX(1);
          }
          48% {
            left: calc(100% - 102px);
            bottom: 31px;
            transform: scaleX(-1) rotate(-1.5deg);
          }
          93% {
            left: -118px;
            bottom: 31px;
            transform: scaleX(-1);
          }
          96% {
            left: -118px;
            bottom: 31px;
            opacity: 1;
            transform: scaleX(-1);
          }
          97% {
            opacity: 0;
          }
          100% {
            left: -118px;
            bottom: 54px;
            opacity: 0;
            transform: scaleX(1);
          }
        }

        @keyframes portal-loader-cut-progress {
          0% {
            transform: scaleX(0);
          }
          43%,
          96% {
            transform: scaleX(1);
          }
          97%,
          100% {
            opacity: 0;
            transform: scaleX(0);
          }
        }

        @keyframes portal-loader-return-progress {
          0%,
          48% {
            transform: scaleX(0);
          }
          93%,
          96% {
            transform: scaleX(1);
          }
          97%,
          100% {
            opacity: 0;
            transform: scaleX(0);
          }
        }

        @keyframes portal-loader-suspension {
          from {
            transform: translateY(0) rotate(-0.35deg);
          }
          to {
            transform: translateY(1.5px) rotate(0.35deg);
          }
        }

        @keyframes portal-loader-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes portal-loader-blade {
          from {
            transform: scaleX(0.94) rotate(0deg);
            opacity: 0.4;
          }
          50% {
            transform: scaleX(1.04) rotate(180deg);
            opacity: 0.72;
          }
          to {
            transform: scaleX(0.94) rotate(360deg);
            opacity: 0.4;
          }
        }

        @keyframes portal-loader-clipping {
          from {
            opacity: 0.8;
            transform: translate(8px, 0) scale(1);
          }
          to {
            opacity: 0;
            transform: translate(-24px, -12px) scale(0.45);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-loader-track {
            left: calc(50% - 110px);
            animation: none;
          }

          .portal-loader-mower,
          .portal-loader-wheel,
          .portal-loader-blade,
          .portal-loader-clipping {
            animation: none;
          }

          .portal-loader-cut {
            animation: none;
            transform: scaleX(0.58);
          }

          .portal-loader-return-cut {
            animation: none;
            transform: scaleX(0.34);
          }
        }
      `}</style>
    </section>
  );
}
