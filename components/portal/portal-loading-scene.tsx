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
          <div className="absolute inset-x-0 bottom-[58px] h-[34px] bg-[repeating-linear-gradient(90deg,rgba(235,245,227,0.48)_0_12px,rgba(235,245,227,0)_12px_24px)] opacity-75" />
          <div className="absolute inset-x-0 bottom-[92px] h-[1px] bg-white/35" />

          <div className="portal-loader-track absolute bottom-[54px] left-[-120px]">
            <div className="relative h-[120px] w-[220px]">
              <div className="absolute bottom-[26px] left-[84px] h-[40px] w-[58px] rounded-[12px_18px_12px_12px] bg-[#516b44] shadow-[inset_0_-5px_0_rgba(0,0,0,0.10)]" />
              <div className="absolute bottom-[53px] left-[102px] h-[24px] w-[11px] rounded-full bg-[#33432e]" />
              <div className="absolute bottom-[72px] left-[93px] h-[18px] w-[33px] rounded-[16px_16px_10px_10px] bg-[#d4bf96]" />
              <div className="absolute bottom-[84px] left-[104px] h-[18px] w-[11px] rounded-full bg-[#594836]" />
              <div className="absolute bottom-[67px] left-[79px] h-[17px] w-[11px] rounded-full bg-[#bf8d65]" />
              <div className="absolute bottom-[67px] left-[128px] h-[17px] w-[11px] rounded-full bg-[#bf8d65]" />
              <div className="absolute bottom-[48px] left-[84px] h-[27px] w-[11px] origin-top rounded-full bg-[#40553a]" />
              <div className="absolute bottom-[48px] left-[124px] h-[27px] w-[11px] origin-top rounded-full bg-[#40553a]" />
              <div className="absolute bottom-[28px] left-[82px] h-[26px] w-[16px] rounded-full bg-[#273327]" />
              <div className="absolute bottom-[28px] left-[122px] h-[26px] w-[16px] rounded-full bg-[#273327]" />

              <div className="absolute bottom-[52px] left-[124px] h-[5px] w-[55px] origin-left rounded-full bg-[#33432e] rotate-[16deg]" />
              <div className="absolute bottom-[65px] left-[171px] h-[9px] w-[9px] rounded-full bg-[#33432e]" />

              <div className="absolute bottom-[24px] left-[132px] h-[28px] w-[52px] rounded-[18px_16px_14px_14px] bg-[#7f9a6d] shadow-[inset_0_-4px_0_rgba(0,0,0,0.10)]" />
              <div className="absolute bottom-[18px] left-[126px] h-[14px] w-[64px] rounded-full bg-[#6f8b5f]/45 blur-[1px]" />

              <div className="portal-loader-wheel absolute bottom-[18px] left-[94px] h-[26px] w-[26px] rounded-full border-[5px] border-[#354235] bg-[#596759]" />
              <div className="portal-loader-wheel absolute bottom-[18px] left-[156px] h-[24px] w-[24px] rounded-full border-[4px] border-[#354235] bg-[#596759]" />

              <div className="portal-loader-blade absolute bottom-[14px] left-[122px] h-[10px] w-[70px] rounded-full bg-[radial-gradient(circle,rgba(170,205,135,0.75)_0_18%,transparent_19%)] opacity-60" />
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
          animation: portal-loader-drive 5.8s linear infinite;
        }

        .portal-loader-wheel {
          animation: portal-loader-spin 0.8s linear infinite;
        }

        .portal-loader-blade {
          animation: portal-loader-blade 0.35s linear infinite;
        }

        @keyframes portal-loader-drive {
          0% {
            transform: translateX(0);
          }
          48% {
            transform: translateX(270px);
          }
          52% {
            transform: translateX(270px) scaleX(-1);
          }
          100% {
            transform: translateX(0) scaleX(-1);
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
      `}</style>
    </section>
  );
}
