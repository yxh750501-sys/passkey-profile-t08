const detailButtons =
    document.querySelectorAll(".detail-button");


detailButtons.forEach((button) => {

    button.addEventListener("click", () => {

        const targetId =
            button.getAttribute("aria-controls");

        const detail =
            document.getElementById(targetId);

        const isOpen =
            button.getAttribute("aria-expanded") === "true";


        button.setAttribute(
            "aria-expanded",
            String(!isOpen)
        );


        detail.hidden = isOpen;


        const icon =
            button.querySelector("span");


        if (icon) {

            icon.textContent =
                isOpen ? "+" : "−";

        }

    });

});